import datetime as dt
from pathlib import Path
from typing import Any

import structlog

from app.config import Settings
from app.coreapi_client import CoreApiClient
from app.parsing.audio_tags import parse_audio_file
from app.parsing.filename_parser import parse_video_filename
from app.providers.musicbrainz_provider import MusicBrainzProvider
from app.providers.tmdb_provider import TmdbProvider
from app.tv_layout import build_episode_target_path, move_episode_file


class EnrichmentService:
    def __init__(
        self,
        settings: Settings,
        core_api: CoreApiClient,
        tmdb: TmdbProvider,
        musicbrainz: MusicBrainzProvider,
    ):
        self._settings = settings
        self._core_api = core_api
        self._tmdb = tmdb
        self._musicbrainz = musicbrainz

    async def handle_transcoded(self, event: dict[str, Any]) -> dict[str, Any]:
        media_item_id = event["mediaItemId"]
        content_type = event["contentType"]
        output_path = event["outputPath"]

        log = structlog.get_logger(service="metadata-service").bind(
            mediaItemId=media_item_id, contentType=content_type
        )
        log.info("enrichment.started", outputPath=output_path)

        context = await self._core_api.get_media_item(media_item_id)

        if content_type == "track":
            result = await self._enrich_track(media_item_id, output_path, context, log)
        elif content_type == "episode":
            result = await self._enrich_episode(media_item_id, output_path, context, log)
        elif content_type == "movie":
            result = await self._enrich_movie(media_item_id, output_path, context, log)
        else:
            raise ValueError(f"Unsupported contentType for enrichment: {content_type}")

        log.info("enrichment.completed", provider=result["provider"], confidence=result.get("confidence"))
        return result

    async def _enrich_movie(
        self, media_item_id: str, output_path: str, context: dict[str, Any], log
    ) -> dict[str, Any]:
        parsed = parse_video_filename(output_path)
        match = await self._tmdb.search_movie(parsed.title or context.get("title", ""), parsed.year)

        p = match.payload
        release_date = p.get("release_date") or ""
        release_year = int(release_date[:4]) if release_date[:4].isdigit() else None

        # Flat, camelCase, `mediaType`-discriminated — matches core-api's ApplyMetadataDto exactly
        # (see services/core-api/src/infrastructure/http/dto/internal.dto.ts). Provider payloads are
        # snake_case internally (see providers/base.py's MatchResult), so this is the one place that
        # translates provider vocabulary into core-api's wire contract.
        metadata_payload = {
            "mediaType": "movie",
            "tmdbId": p.get("tmdb_id"),
            "imdbId": p.get("imdb_id"),
            "overview": p.get("overview"),
            "runtimeMinutes": p.get("runtime_minutes"),
            "originalLanguage": p.get("original_language"),
            "posterPath": p.get("poster_path"),
            "backdropPath": p.get("backdrop_path"),
            "releaseYear": release_year,
        }
        await self._core_api.write_media_item_metadata(media_item_id, metadata_payload)

        return {"provider": "tmdb", "matchedExternalId": match.external_id, "confidence": match.confidence}

    async def _enrich_episode(
        self, media_item_id: str, output_path: str, context: dict[str, Any], log
    ) -> dict[str, Any]:
        parsed = parse_video_filename(output_path)
        series_title = parsed.title or context.get("title", "")

        series_match = await self._tmdb.search_tv(series_title)
        series_payload = series_match.payload

        season_number = parsed.season_number or 1
        episode_number = parsed.episode_number or 1

        episode_details: dict[str, Any] = {}
        if series_match.matched:
            episode_details = await self._tmdb.get_episode(
                int(series_match.external_id), season_number, episode_number
            )

        # Upsert series/season BEFORE moving the file — the target folder name depends on the
        # canonical series title/year TMDb (and core-api's upsert) agree on, not the raw filename guess.
        upsert_result = await self._core_api.upsert_series(
            {
                "tmdbId": series_payload.get("tmdb_id"),
                "title": series_payload.get("title") or series_title,
                "overview": series_payload.get("overview"),
                "posterPath": series_payload.get("poster_path"),
                "backdropPath": series_payload.get("backdrop_path"),
                "firstAirDate": series_payload.get("first_air_date"),
                "seasonNumber": season_number,
            }
        )

        # core-api's /internal/series/upsert returns { series: Series, season: Season }
        # (see services/core-api/src/domain/series/series.entity.ts) — not a flat seriesId/seasonId/
        # seriesTitle shape.
        series_id = upsert_result["series"]["id"]
        season_id = upsert_result["season"]["id"]
        canonical_title = upsert_result["series"].get("title") or series_payload.get("title") or series_title
        year = None
        first_air_date = series_payload.get("first_air_date")
        if first_air_date:
            year = int(first_air_date[:4]) if first_air_date[:4].isdigit() else None

        extension = Path(output_path).suffix.lstrip(".") or "mkv"
        target_path = build_episode_target_path(
            tv_root=self._settings.TV_STREAMABLE_ROOT,
            series_title=canonical_title,
            series_year=year,
            season_number=season_number,
            episode_number=episode_number,
            episode_title=episode_details.get("title"),
            extension=extension,
        )

        try:
            final_path = move_episode_file(output_path, target_path)
        except FileNotFoundError:
            # At-least-once delivery: if this event is redelivered after a prior successful move,
            # the source no longer exists. If the target is already there, the move already happened.
            if target_path.exists():
                log.warning("enrichment.episode_already_moved", targetPath=str(target_path))
                final_path = target_path
            else:
                raise

        metadata_payload = {
            "mediaType": "episode",
            "seriesId": series_id,
            "seasonId": season_id,
            "episodeNumber": episode_number,
            "overview": episode_details.get("overview"),
            "airDate": episode_details.get("air_date"),
            "episodeTitle": episode_details.get("title"),
            "newFilePath": str(final_path),
        }
        await self._core_api.write_media_item_metadata(media_item_id, metadata_payload)

        return {
            "provider": "tmdb",
            "matchedExternalId": series_match.external_id,
            "confidence": series_match.confidence,
        }

    async def _enrich_track(
        self, media_item_id: str, output_path: str, context: dict[str, Any], log
    ) -> dict[str, Any]:
        parsed = parse_audio_file(output_path)
        log.info("enrichment.track_tags_parsed", source=parsed.source)

        match = await self._musicbrainz.search_recording(
            title=parsed.title or context.get("title", ""),
            artist=parsed.artist,
            album=parsed.album,
        )

        cover_art_url = None
        release_id = match.payload.get("musicbrainz_release_id")
        if release_id:
            cover_art_url = await self._musicbrainz.get_cover_art_url(release_id)

        p = match.payload
        metadata_payload = {
            "mediaType": "track",
            "musicbrainzRecordingId": p.get("musicbrainz_recording_id"),
            "musicbrainzReleaseId": p.get("musicbrainz_release_id"),
            "artistName": p.get("artist_name"),
            "albumName": p.get("album_name"),
            "trackNumber": p.get("track_number"),
            "discNumber": p.get("disc_number"),
            "coverArtUrl": cover_art_url,
        }
        await self._core_api.write_media_item_metadata(media_item_id, metadata_payload)

        return {"provider": "musicbrainz", "matchedExternalId": match.external_id, "confidence": match.confidence}


def utcnow_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()
