import json
from typing import Awaitable, Callable

import nats
import structlog

logger = structlog.get_logger(service="metadata-service")

STREAM_NAME = "HOMESTREAM_EVENTS"
STREAM_SUBJECTS = ["torrent.>", "media.>"]
TRANSCODED_SUBJECT = "media.transcoded"


async def connect(nats_url: str):
    nc = await nats.connect(nats_url)
    js = nc.jetstream()
    try:
        await js.add_stream(name=STREAM_NAME, subjects=STREAM_SUBJECTS)
    except Exception:
        # Another service (core-api, typically first to boot) likely already created the stream
        # with the same config — creation is treated as idempotent, not fatal, here.
        logger.info("nats.stream_already_exists", stream=STREAM_NAME)
    return nc, js


async def run_transcoded_consumer(
    js, durable_name: str, handler: Callable[[dict], Awaitable[None]]
) -> None:
    sub = await js.pull_subscribe(TRANSCODED_SUBJECT, durable=durable_name, stream=STREAM_NAME)

    while True:
        try:
            messages = await sub.fetch(1, timeout=5)
        except TimeoutError:
            continue
        except Exception:
            logger.exception("nats.fetch_failed")
            continue

        for msg in messages:
            try:
                event = json.loads(msg.data)
                await handler(event)
                await msg.ack()
            except Exception:
                logger.exception("event.handler_failed", subject=msg.subject)
                await msg.nak()
