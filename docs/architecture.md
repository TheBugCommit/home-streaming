# Architecture

## Why polyglot microservices

Each service is written in the language best suited to its one job, rather than a single shared
stack:

- **core-api — TypeScript/NestJS.** This is the only stateful, single-source-of-truth service (owns
  Postgres, issues tokens, exposes the public API). NestJS's built-in DI container, decorators, and
  module system make hexagonal layering (below) close to free, and its ecosystem has mature,
  well-typed libraries for everything this service needs: Prisma, Passport-less JWT, class-validator
  DTOs, Swagger generation, Pino logging.
- **torrent-worker / transcode-worker — Go.** Both are small, I/O-bound processes whose entire job is
  "hold a long-lived HTTP/NATS connection and react to events." Go's static binaries, low memory
  footprint, and goroutine-per-connection model fit that shape well, and neither needs a rich web
  framework — they're a handful of HTTP routes and a NATS subscriber each.
- **metadata-service — Python/FastAPI.** Metadata enrichment leans on best-in-class Python libraries
  that don't have equivalents elsewhere: `guessit` (release-filename parsing), `mutagen` (audio tag
  reading), `rapidfuzz` (fuzzy title matching). Rewriting these in Go or TypeScript would mean losing
  years of community tuning for a narrow, solved problem.

## Library directory contract

```
${VIDEOS_PATH}/
  incoming/                    # qBittorrent's incomplete-download staging — nothing else mounts this
  library/{movies,tv,music}/   # qBittorrent's completed-download save path = Tdarr's source library
  streamable/{movies,tv,music}/# Tdarr's output = Jellyfin's only (read-only) mount
```

(See `docker-compose.yml`'s volume mounts for `qbittorrent`, `tdarr`, and `jellyfin` — this is
enforced by which host paths are mounted into which container, not by convention.)

This three-stage layout is the mechanism, not just the intent, behind two guarantees:

1. **Jellyfin can never serve a pre-transcode file.** Jellyfin's container only mounts
   `streamable/`. A file cannot appear there until Tdarr has finished writing its transcoded output
   — there is no path by which a partially-downloaded or untranscoded file becomes visible to
   Jellyfin.
2. **Tdarr never races the downloader.** Tdarr's Library folders are `library/{movies,tv,music}` —
   qBittorrent only moves a torrent's files there once the download is 100%(complete, via an
   explicit `savepath` per category set at `torrents/add` time, not qBittorrent's Automatic Torrent
   Management path inference). Partial files live only in `incoming/`, which Tdarr never scans.

`torrent-worker` and `transcode-worker` don't mount the filesystem at all — they only pass around
`/data/...`-prefixed path *strings* that originated from a container that does have the mount, so
every service agrees on path semantics without every service needing filesystem access.
`metadata-service` is the one deliberate exception: it has a scoped read-write mount at
`/data/streamable/tv` only, because it's the one place in the pipeline that renames/moves a file
after the fact (see `docs/metadata-service.md`).

## CPU-only production vs. local GPU overlay

The dedicated server this system targets has **no GPU**. `docker-compose.yml` is written CPU-only
(Tdarr's transcode Flow uses `libx264`, not NVENC) because that's what actually runs in production.
The development machine used to build this system has an NVIDIA RTX 2050, so
`docker-compose.gpu.local.yml` exists as an optional overlay (`runtime: nvidia` on the `tdarr`
service) purely to speed up local iteration:

```
docker compose -f docker-compose.yml -f docker-compose.gpu.local.yml up -d
```

This file must never be treated as the production configuration — see its header comment.

## Event bus: NATS JetStream over RabbitMQ

Inter-service communication is split into two mechanisms, deliberately:

- **NATS JetStream** for fire-and-forget *trigger/handoff* events between services that don't need
  an immediate response (`torrent.enqueue`, `media.downloaded`, `media.transcode_pending`,
  `media.transcode_status_changed`, `media.transcoded`, `media.metadata_enriched`). JetStream gives
  at-least-once delivery with durable consumers, so a service restart doesn't drop in-flight work.
- **Synchronous internal HTTP** (`core-api`'s `/internal/*` routes, guarded by a static
  `INTERNAL_API_KEY`) for the one case that's naturally request/response-shaped: `metadata-service`
  reading existing context before searching providers, then writing back a rich, validated payload.

NATS was chosen over RabbitMQ for its lighter resource footprint — this system already spends most
of its host's headroom on Tdarr's CPU-bound transcode jobs (see above: no GPU in production), so the
message bus itself shouldn't compete for meaningful CPU/memory. See `shared/events/README.md` and
`docs/events.md` for the full contract.

## Hexagonal architecture in core-api (and its SOLID mapping)

`services/core-api/src/` is layered domain → application → infrastructure, with dependencies only
ever pointing inward:

```
domain/            # entities + repository "port" interfaces — no framework, no Prisma, no HTTP
  media/, torrents/, transcode/, users/, auth/, categories/, series/, events/
application/        # one use-case class per action, depends only on domain ports
  media/, torrents/, users/, api-keys/, categories/, series/
infrastructure/     # the only layer allowed to know about Prisma, NATS, or HTTP
  persistence/prisma/, persistence/repositories/   # implement the domain ports
  messaging/                                       # NATS publisher + subscribers
  http/controllers/, http/guards/, http/dto/
```

This maps directly onto SOLID:

- **Dependency Inversion** — every use-case (e.g. `SubmitTorrentUseCase`) takes a domain port
  (`TorrentRepository`, `EventPublisher`) via constructor injection; it never imports
  `PrismaService` or a NATS client directly. Swapping Prisma for another ORM, or NATS for another
  bus, only touches `infrastructure/`.
- **Interface Segregation** — repository ports are narrow and per-aggregate
  (`MediaItemRepository`, `TorrentRepository`, `ApiKeyRepository`, ...), not one god-repository.
- **Single Responsibility** — one file, one use-case, one reason to change
  (`submit-torrent.use-case.ts`, `apply-metadata.use-case.ts`, ...).
- **Open/Closed** — new content types or auth mechanisms extend `infrastructure/` (a new guard, a
  new repository implementation) without modifying existing use-cases.

See `docs/core-api.md` for the full file map and route table.
