from typing import Any

import httpx


class CoreApiClient:
    """Thin client for core-api's /internal/* endpoints, guarded by INTERNAL_API_KEY.
    See shared/events/README.md for the endpoint contract."""

    def __init__(self, base_url: str, internal_api_key: str):
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"X-Internal-Api-Key": internal_api_key},
            timeout=15.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_media_item(self, media_item_id: str) -> dict[str, Any]:
        resp = await self._client.get(f"/internal/media-items/{media_item_id}")
        resp.raise_for_status()
        return resp.json()

    async def upsert_series(self, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._client.post("/internal/series/upsert", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def write_media_item_metadata(self, media_item_id: str, payload: dict[str, Any]) -> None:
        resp = await self._client.post(f"/internal/media-items/{media_item_id}/metadata", json=payload)
        resp.raise_for_status()
