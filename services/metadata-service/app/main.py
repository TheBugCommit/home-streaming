import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings
from app.coreapi_client import CoreApiClient
from app.enrichment import EnrichmentService, utcnow_iso
from app.events.publisher import EventPublisher
from app.events.subscriber import connect, run_transcoded_consumer
from app.logging_setup import configure_logging
from app.providers.musicbrainz_provider import MusicBrainzProvider
from app.providers.tmdb_provider import TmdbProvider

configure_logging()
logger = structlog.get_logger(service="metadata-service")

state: dict = {}


async def _consume_loop() -> None:
    async def handler(event: dict) -> None:
        result = await state["enrichment"].handle_transcoded(event)
        await state["publisher"].publish_metadata_enriched(
            {
                "mediaItemId": event["mediaItemId"],
                "provider": result["provider"],
                "matchedExternalId": result.get("matchedExternalId"),
                "confidence": result.get("confidence"),
                "occurredAt": utcnow_iso(),
            }
        )

    await run_transcoded_consumer(state["js"], settings.NATS_CONSUMER_NAME, handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    nc, js = await connect(settings.NATS_URL)
    state["nc"] = nc
    state["js"] = js
    state["publisher"] = EventPublisher(js)
    state["core_api"] = CoreApiClient(settings.CORE_API_INTERNAL_URL, settings.INTERNAL_API_KEY)
    state["tmdb"] = TmdbProvider(settings.TMDB_API_KEY)
    state["musicbrainz"] = MusicBrainzProvider(settings.MUSICBRAINZ_CONTACT)
    state["enrichment"] = EnrichmentService(
        settings, state["core_api"], state["tmdb"], state["musicbrainz"]
    )

    consume_task = asyncio.create_task(_consume_loop())
    logger.info("metadata-service.started")

    yield

    consume_task.cancel()
    await state["core_api"].aclose()
    await state["tmdb"].aclose()
    await state["musicbrainz"].aclose()
    await nc.close()
    logger.info("metadata-service.stopped")


app = FastAPI(title="metadata-service", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
