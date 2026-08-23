import asyncio
import time
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.matching.confidence import title_confidence
from app.providers.base import MatchResult
from app.providers.coverart_provider import CoverArtProvider

MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2"


class _RateLimiter:
    """Process-wide limiter enforcing MusicBrainz's 1 request/sec usage policy.

    Only applied to MusicBrainz calls — TMDb allows much higher throughput and doesn't need this.
    """

    def __init__(self, min_interval_seconds: float = 1.0):
        self._min_interval = min_interval_seconds
        self._lock = asyncio.Lock()
        self._last_call_monotonic: float | None = None

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if self._last_call_monotonic is not None:
                elapsed = now - self._last_call_monotonic
                remaining = self._min_interval - elapsed
                if remaining > 0:
                    await asyncio.sleep(remaining)
            self._last_call_monotonic = time.monotonic()


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


class MusicBrainzProvider:
    def __init__(self, contact: str, logger=None):
        # MusicBrainz usage policy requires a descriptive User-Agent with contact info.
        user_agent = f"home-streaming-metadata-service/0.1 ( {contact} )"
        self._client = httpx.AsyncClient(
            base_url=MUSICBRAINZ_BASE_URL,
            headers={"User-Agent": user_agent},
            timeout=15.0,
        )
        self._coverart = CoverArtProvider(user_agent=user_agent)
        self._rate_limiter = _RateLimiter()
        self._logger = logger

    async def aclose(self) -> None:
        await self._client.aclose()
        await self._coverart.aclose()

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        @retry(
            stop=stop_after_attempt(4),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception(_is_retryable),
            reraise=True,
        )
        async def _do():
            await self._rate_limiter.wait()
            resp = await self._client.get(path, params={**params, "fmt": "json"})
            resp.raise_for_status()
            return resp.json()

        return await _do()

    async def search_recording(
        self, title: str, artist: str | None = None, album: str | None = None
    ) -> MatchResult:
        query_parts = [f'recording:"{title}"']
        if artist:
            query_parts.append(f'artist:"{artist}"')
        if album:
            query_parts.append(f'release:"{album}"')
        query = " AND ".join(query_parts)

        data = await self._get("/recording", {"query": query, "limit": 5})
        recordings = data.get("recordings") or []
        if not recordings:
            return MatchResult(provider="musicbrainz", external_id=None, confidence=0.0)

        def score(rec: dict[str, Any]) -> float:
            return title_confidence(title, rec.get("title", ""))

        best = max(recordings, key=score)
        confidence = score(best)

        artist_credit = best.get("artist-credit") or []
        artist_name = artist_credit[0]["artist"]["name"] if artist_credit else artist

        releases = best.get("releases") or []
        release_id = releases[0]["id"] if releases else None
        release_title = releases[0].get("title") if releases else album
        track_number = None
        if releases and releases[0].get("media"):
            tracks = releases[0]["media"][0].get("track-offset")
            track_number = (tracks + 1) if tracks is not None else None

        payload = {
            "musicbrainz_recording_id": best.get("id"),
            "musicbrainz_release_id": release_id,
            "artist_name": artist_name,
            "album_name": release_title,
            "track_number": track_number,
            "disc_number": None,
        }
        return MatchResult(
            provider="musicbrainz", external_id=best.get("id"), confidence=confidence, payload=payload
        )

    async def get_cover_art_url(self, release_mbid: str) -> str | None:
        return await self._coverart.get_front_cover_url(release_mbid)
