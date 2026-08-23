# home-streaming

Torrent upload → managed download → CPU transcode (no live transcode needed at playback) →
categorized/metadata-enriched library → Jellyfin streaming, behind a token-protected API. See
`/home/penguin/.claude/plans/en-un-servidor-dedicat-woolly-sunbeam.md` for the full design
rationale; this file covers what's built and how to run it.

## Services

| service | language | role |
|---|---|---|
| `core-api` | TypeScript/NestJS | Owns Postgres, auth (JWT + API keys), public REST API, orchestrates via NATS |
| `torrent-worker` | Go | Wraps qBittorrent's Web API, receives its on-completion webhook |
| `transcode-worker` | Go | Correlates downloaded files with Tdarr's transcode queue, triggers Jellyfin refresh |
| `metadata-service` | Python/FastAPI | TMDb (movies/TV) + MusicBrainz (music) enrichment, TV file renaming |
| `postgres`, `nats`, `qbittorrent`, `tdarr`, `jellyfin`, `loki`, `grafana` | — | infrastructure |

Event contracts live in `shared/events/` — read that first before changing any inter-service payload.

## First-time setup

1. Copy `.env.example` to `.env` and fill in the generated secrets (already done in this checkout).
2. Install the Loki Docker logging driver (**required** before `docker compose up` — every service
   is configured with `logging: driver: loki`, so containers fail to start without it):
   ```
   ./scripts/install-loki-docker-driver.sh
   ```
3. `docker compose up -d`
4. Seed qBittorrent's WebUI password (its image only offers a random temporary password on first
   boot, not one you can set via env var):
   ```
   docker compose stop qbittorrent
   python3 scripts/seed-qbittorrent-password.py
   docker compose up -d qbittorrent
   ```
   (Run this while qbittorrent is **stopped** — editing its config while it's running gets
   overwritten when the process later flushes its in-memory state back to disk.)
5. In Tdarr's UI (`http://localhost:8265`), create the three Libraries and the transcode Flow
   described in `tdarr/flows/README.md`, then note each Library's id into `.env`'s
   `TDARR_MOVIES_LIBRARY_ID` / `TDARR_TV_LIBRARY_ID` / `TDARR_MUSIC_LIBRARY_ID`.
6. In Jellyfin's UI (`http://localhost:8096`), point the Movies/TV/Music libraries at
   `streamable/movies`, `streamable/tv`, `streamable/music`, generate an API key (Dashboard → API
   Keys), and fill in `.env`'s `JELLYFIN_API_KEY` / `JELLYFIN_MOVIES_LIBRARY_ID` /
   `JELLYFIN_TV_LIBRARY_ID` / `JELLYFIN_MUSIC_LIBRARY_ID`.
7. Register a free TMDb API key at themoviedb.org and set `.env`'s `TMDB_API_KEY`.
8. `docker compose up -d` again to pick up the new env vars (`transcode-worker`/`metadata-service`
   only read them at container start).

Local-only GPU testing (this dev machine has an RTX 2050; the actual dedicated server does not —
see `docker-compose.gpu.local.yml`'s header comment):
```
docker compose -f docker-compose.yml -f docker-compose.gpu.local.yml up -d
```

## Verifying it end-to-end

- `GET http://localhost:3000/health` — core-api health.
- `GET http://localhost:3000/docs` — Swagger for the full public API.
- Log in (`POST /api/v1/auth/login` with `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD`), upload a `.torrent`
  via `POST /api/v1/torrents`, and watch it flow: qBittorrent (`:8080`) → `torrent-worker` logs →
  `GET /api/v1/torrents/:id` status transitions → Tdarr (`:8265`) job → `transcode-worker` logs →
  `GET /api/v1/media/:id` → Jellyfin library refresh → `metadata-service` logs.
- Grafana (`http://localhost:3001`, user `admin` / `GRAFANA_ADMIN_PASSWORD`) has a Loki datasource
  pre-provisioned — query `{service="core-api"} |= "<some id>"` (or any other service label) to see
  every service's logs for one item's journey, correlated by `mediaItemId`/`torrentId`/
  `transcodeJobId` rather than a separate tracing system.

## Known gaps / follow-ups

- `torrent-worker`'s `requestId` correlation from upload → completion is best-effort: qBittorrent's
  completion hook has no way to carry our original request id through, so `media.downloaded`'s
  `requestId` is only populated when the torrent hash can be matched back to a known submission.
- `transcode-worker`'s Tdarr adapter targets Tdarr's `cruddb`-style query API, which isn't formally
  versioned/documented the way qBittorrent's is — verify its exact query shape against your pinned
  Tdarr version (pin Tdarr to a specific tag once this is validated, rather than `:latest`).
- The React admin frontend (`frontend-admin`) is out of scope for this phase — Swagger is the only
  UI for now.
