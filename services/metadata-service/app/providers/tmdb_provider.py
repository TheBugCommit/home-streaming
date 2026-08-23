from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.matching.confidence import title_confidence
from app.providers.base import MatchResult

TMDB_BASE_URL = "https://api.themoviedb.org/3"


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


def _retryable_get(client: httpx.AsyncClient):
    return retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )


class TmdbProvider:
    """Movie + TV metadata provider. TMDb's rate limits are generous enough that we only need
    basic retry/backoff on 429s, unlike MusicBrainz which needs a hard 1 req/sec cap."""

    def __init__(self, api_key: str, logger=None):
        self._api_key = api_key
        self._logger = logger
        self._client = httpx.AsyncClient(base_url=TMDB_BASE_URL, timeout=15.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        params = {**(params or {}), "api_key": self._api_key}

        @_retryable_get(self._client)
        async def _do():
            resp = await self._client.get(path, params=params)
            resp.raise_for_status()
            return resp.json()

        return await _do()

    async def search_movie(self, title: str, year: int | None = None) -> MatchResult:
        params: dict[str, Any] = {"query": title}
        if year:
            params["year"] = year

        data = await self._get("/search/movie", params)
        results = data.get("results") or []
        if not results:
            return MatchResult(provider="tmdb", external_id=None, confidence=0.0)

        best = max(
            results,
            key=lambda r: title_confidence(
                title,
                r.get("title", ""),
                year_match=(str(year) in (r.get("release_date") or "")) if year else None,
            ),
        )
        confidence = title_confidence(
            title,
            best.get("title", ""),
            year_match=(str(year) in (best.get("release_date") or "")) if year else None,
        )

        details = await self._get(
            f"/movie/{best['id']}", {"append_to_response": "external_ids"}
        )

        payload = {
            "tmdb_id": details.get("id"),
            "imdb_id": (details.get("external_ids") or {}).get("imdb_id") or details.get("imdb_id"),
            "title": details.get("title"),
            "overview": details.get("overview"),
            "runtime_minutes": details.get("runtime"),
            "original_language": details.get("original_language"),
            "poster_path": details.get("poster_path"),
            "backdrop_path": details.get("backdrop_path"),
            "release_date": details.get("release_date"),
        }
        return MatchResult(provider="tmdb", external_id=str(details.get("id")), confidence=confidence, payload=payload)

    async def search_tv(self, title: str) -> MatchResult:
        data = await self._get("/search/tv", {"query": title})
        results = data.get("results") or []
        if not results:
            return MatchResult(provider="tmdb", external_id=None, confidence=0.0)

        best = max(results, key=lambda r: title_confidence(title, r.get("name", "")))
        confidence = title_confidence(title, best.get("name", ""))

        payload = {
            "tmdb_id": best.get("id"),
            "title": best.get("name"),
            "overview": best.get("overview"),
            "poster_path": best.get("poster_path"),
            "backdrop_path": best.get("backdrop_path"),
            "first_air_date": best.get("first_air_date"),
        }
        return MatchResult(provider="tmdb", external_id=str(best.get("id")), confidence=confidence, payload=payload)

    async def get_episode(self, tv_id: int, season_number: int, episode_number: int) -> dict[str, Any]:
        data = await self._get(f"/tv/{tv_id}/season/{season_number}/episode/{episode_number}")
        return {
            "tmdb_episode_id": data.get("id"),
            "episode_number": data.get("episode_number", episode_number),
            "season_number": data.get("season_number", season_number),
            "title": data.get("name"),
            "overview": data.get("overview"),
            "air_date": data.get("air_date"),
        }
