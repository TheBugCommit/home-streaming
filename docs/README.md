# home-streaming — technical documentation

This is the complete technical reference for how the system is built and how it works internally —
architecture, data model, event contracts, and a per-service breakdown of the code. For a practical
quickstart (how to bring the stack up, one-time setup steps), see the root `README.md` instead;
this folder assumes that stack is already running and explains what's actually happening inside it.

## What the system does

Upload a `.torrent` through a protected API → it downloads via a managed torrent client → once
complete, the video/audio is transcoded once (in the background, on CPU) into a format that needs
no live transcoding at playback time → the result is enriched with real metadata (movie/TV/music) →
Jellyfin serves it, and can stream it to multiple simultaneous viewers without ever transcoding
live, because the file is already in a broadly-compatible format.

```
                 ┌─────────────┐  torrent.enqueue   ┌────────────────┐
  admin ── POST  │   core-api  │ ──────────────────▶│ torrent-worker │──▶ qBittorrent
  /torrents      │  (NestJS)   │                     └────────────────┘   (downloads to
                 │  Postgres   │◀──── media.downloaded ─────┘              library/<cat>/)
                 │             │
                 │             │──── media.transcode_pending ──▶┌──────────────────┐
                 │             │                                 │ transcode-worker │──▶ Tdarr
                 │             │◀── media.transcode_status_* ───┘  (polls, never    │   (auto-scans
                 │             │◀────── media.transcoded ────────┘   triggers)      │    library/,
                 │             │                                                      writes to
                 │             │                                                      streamable/)
                 │             │                                        │
                 │             │                                        └──▶ Jellyfin refresh
                 │             │
                 │             │◀── POST /internal/media-items/:id/metadata ──┐
                 │             │◀── POST /internal/series/upsert ─────────────┤ metadata-service
                 │             │──── GET /internal/media-items/:id ──────────▶┘ (TMDb / MusicBrainz,
                 └─────────────┘        (also consumes media.transcoded)         renames TV episodes)
```

Full walkthrough with exact payloads: `events.md`.

## Services

| service | language | role | docs |
|---|---|---|---|
| `core-api` | TypeScript / NestJS | Owns Postgres, auth (JWT + API keys), public REST API, orchestration | `core-api.md` |
| `torrent-worker` | Go | qBittorrent Web API adapter, receives its completion webhook | `torrent-worker.md` |
| `transcode-worker` | Go | Correlates downloads with Tdarr's transcode queue, triggers Jellyfin refresh | `transcode-worker.md` |
| `metadata-service` | Python / FastAPI | TMDb + MusicBrainz enrichment, TV file renaming | `metadata-service.md` |
| `postgres`, `nats`, `qbittorrent`, `tdarr`, `jellyfin`, `loki`, `grafana` | — | infrastructure | `operations.md` |

## Contents

- **[architecture.md](architecture.md)** — why polyglot, the library directory contract, CPU-only
  production vs. local GPU overlay, NATS vs. RabbitMQ, hexagonal architecture & SOLID in core-api.
- **[data-model.md](data-model.md)** — the full Postgres schema: every entity, its fields, its
  relationships, and why it's shaped the way it is.
- **[events.md](events.md)** — the end-to-end pipeline walkthrough, every event's exact payload, and
  the internal HTTP contract between metadata-service and core-api.
- **[core-api.md](core-api.md)** — file map, the three auth mechanisms, the full REST route table,
  logging/redaction setup.
- **[torrent-worker.md](torrent-worker.md)** — the qBittorrent adapter, bootstrap sequence, and its
  known `requestId` correlation limitation.
- **[transcode-worker.md](transcode-worker.md)** — the correlation-poller design and the flagged
  uncertainty in Tdarr's query API.
- **[metadata-service.md](metadata-service.md)** — parsing, providers, rate limiting, confidence
  scoring, and the TV episode rename flow.
- **[operations.md](operations.md)** — services/ports/env-var reference, centralized logging setup,
  the qBittorrent password-seeding requirement, and known gaps.
