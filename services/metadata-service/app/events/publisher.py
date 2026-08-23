import json
from typing import Any


class EventPublisher:
    def __init__(self, js):
        self._js = js

    async def publish_metadata_enriched(self, payload: dict[str, Any]) -> None:
        await self._js.publish("media.metadata_enriched", json.dumps(payload).encode())
