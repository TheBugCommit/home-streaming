import httpx

COVERART_BASE_URL = "https://coverartarchive.org"


class CoverArtProvider:
    """Cover Art Archive lookup, keyed by a MusicBrainz *release* id (not a recording id)."""

    def __init__(self, user_agent: str):
        self._client = httpx.AsyncClient(
            base_url=COVERART_BASE_URL, headers={"User-Agent": user_agent}, timeout=15.0
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_front_cover_url(self, release_mbid: str) -> str | None:
        try:
            resp = await self._client.get(f"/release/{release_mbid}/front-250")
            if resp.status_code == 200:
                return str(resp.url)
        except httpx.HTTPError:
            return None
        return None
