# Event contracts

Source of truth for the NATS JetStream event payloads flowing between `core-api`, `torrent-worker`,
`transcode-worker` and `metadata-service`. Every service validates against these schemas in its own
language (ajv in core-api, `santhosh-tekuri/jsonschema` in the Go workers, `jsonschema` in
metadata-service) rather than hand-copying field lists — treat a schema change here as the first
step of any event contract change, not an afterthought.

Stream: `HOMESTREAM_EVENTS`, subjects `torrent.*` and `media.*`, durable consumer per service group.

| subject | schema | publisher | consumer(s) |
|---|---|---|---|
| `torrent.enqueue` | `torrent.enqueue.v1.json` | core-api | torrent-worker |
| `media.downloaded` | `media.downloaded.v1.json` | torrent-worker | core-api |
| `media.transcode_pending` | `media.transcode_pending.v1.json` | core-api | transcode-worker |
| `media.transcode_status_changed` | `media.transcode_status_changed.v1.json` | transcode-worker | core-api |
| `media.transcoded` | `media.transcoded.v1.json` | transcode-worker | core-api, metadata-service |
| `media.metadata_enriched` | `media.metadata_enriched.v1.json` | metadata-service | (none yet — reserved) |

Internal synchronous HTTP (not events, no host port published), all under `core-api`'s `/internal/*`
prefix guarded by the static `INTERNAL_API_KEY`:
- `GET /internal/media-items/:id`
- `POST /internal/media-items/:id/metadata`
- `POST /internal/series/upsert`

Every published log line and event payload should carry the relevant domain id
(`mediaItemId` / `torrentHash` / `transcodeJobId`) — that's the correlation key used to trace a
single item's journey across services in Grafana/Loki, instead of a separate distributed tracing
system.
