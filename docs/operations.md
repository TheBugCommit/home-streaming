# Operations

This is the deeper, technical companion to the root `README.md`'s quickstart — read that first for
the ordered setup steps. This document explains *why* each operational quirk exists.

## Services & ports

| service | image/build | published ports | depends_on |
|---|---|---|---|
| `jellyfin` | `jellyfin/jellyfin:latest` | 8096 (web), 8920, 7359/udp, 1900/udp | — |
| `tdarr` | `ghcr.io/haveagitgat/tdarr:latest` | 8265 (web), 8266 | — |
| `postgres` | `postgres:16-alpine` | *(none — internal only)* | — |
| `nats` | `nats:2-alpine` (JetStream: `-js -sd /data`) | *(none)* | — |
| `qbittorrent` | `lscr.io/linuxserver/qbittorrent:latest` | `QBITTORRENT_WEBUI_PORT` (default 8080), 6881 (tcp+udp) | — |
| `core-api` | `services/core-api` | `CORE_API_PORT` (default 3000) → container's fixed 3000 | postgres (healthy), nats |
| `torrent-worker` | `services/torrent-worker` | *(none — internal only, port 8090)* | qbittorrent, nats |
| `transcode-worker` | `services/transcode-worker` | *(none)* | tdarr, nats, jellyfin |
| `metadata-service` | `services/metadata-service` | *(none)* | nats, core-api |
| `loki` | `grafana/loki:latest` | 3100 | — |
| `grafana` | `grafana/grafana:latest` | 3001 → container's 3000 | loki |

## Environment variables, by which service reads them

| var | read by | purpose |
|---|---|---|
| `VIDEOS_PATH` | host (compose) | root of `incoming/`, `library/`, `streamable/` — see `docs/architecture.md` |
| `TZ` | tdarr, qbittorrent | timezone |
| `POSTGRES_USER`/`PASSWORD`/`DB` | postgres, core-api (`DATABASE_URL`) | |
| `NATS_URL` | core-api, torrent-worker, transcode-worker, metadata-service | `nats://nats:4222` |
| `QBITTORRENT_WEBUI_PORT`/`USERNAME`/`PASSWORD` | qbittorrent (webui port only), torrent-worker (all three, to log in) | see qBittorrent password caveat below |
| `CORE_API_PORT` | host→core-api port mapping only (container always listens on 3000) | |
| `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` | core-api | signs/verifies access & refresh tokens |
| `INTERNAL_API_KEY` | core-api, torrent-worker\*, transcode-worker\*, metadata-service | guards `/internal/*` (\*not all workers currently call `/internal/*` — only metadata-service does today) |
| `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD` | core-api | one-time admin bootstrap, see `docs/core-api.md` |
| `TMDB_API_KEY` | metadata-service | register free at themoviedb.org |
| `MUSICBRAINZ_CONTACT` | metadata-service | required in MusicBrainz's `User-Agent` policy |
| `JELLYFIN_URL`/`JELLYFIN_API_KEY` | core-api, transcode-worker | generated manually in Jellyfin's dashboard |
| `JELLYFIN_MOVIES_LIBRARY_ID`/`_TV_LIBRARY_ID`/`_MUSIC_LIBRARY_ID` | transcode-worker | targeted per-library refresh vs. full-library fallback |
| `TDARR_SERVER_URL` | transcode-worker | `http://tdarr:8266` |
| `TDARR_MOVIES_LIBRARY_ID`/`_TV_LIBRARY_ID`/`_MUSIC_LIBRARY_ID` | transcode-worker | Tdarr-internal Library ids, needed to query `cruddb` — see `docs/transcode-worker.md`'s caveat |
| `GRAFANA_ADMIN_PASSWORD` | grafana | |

## Centralized logging (Loki + Grafana)

Every service in `docker-compose.yml` shares the `x-loki-logging` anchor
(`logging: driver: loki`, label `service={{.Name}}`) — this is what lets Grafana show logs
differentiated per service without any service having to implement its own log shipping (see
`docs/architecture.md`). Two consequences:

- **The Loki Docker logging driver plugin must be installed on the host before `docker compose up`
  will work at all** — without it, *every* container (including `jellyfin`/`tdarr`, which otherwise
  have nothing to do with this) fails to start, because Docker can't resolve the `loki` logging
  driver. Install once with `./scripts/install-loki-docker-driver.sh` (idempotent — checks if
  already installed first).
- Grafana has a Loki datasource pre-provisioned via
  `grafana/provisioning/datasources/loki.yml` (`http://loki:3100`, set as default) — no manual
  datasource setup needed after first boot.
- **Cross-service correlation**: rather than a separate distributed-tracing system, every service
  logs the relevant domain id (`mediaItemId`/`torrentId`/`transcodeJobId`) on every event it
  processes (see each service's own doc page). Query Grafana/Loki with, e.g.,
  `{service=~"core-api|torrent-worker"} |= "<some id>"` to see one item's entire journey across
  services in one place.
- `grafana/data` and `loki/data` are host bind mounts that need to be writable by the containers'
  non-root users — if you recreate these directories, `chmod 777` them (or match the container's
  actual UID) before first start, or both containers will crash-loop on a permission error.

## qBittorrent password: why a script exists

The `lscr.io/linuxserver/qbittorrent` image has **no environment variable for the WebUI password** —
it only generates a random temporary password on first boot (printed to the container's logs,
"temporary password provided for this session"), and expects a human to change it via the WebUI.
That's incompatible with `torrent-worker`'s automated bootstrap, which needs to log in
non-interactively with `QBITTORRENT_USERNAME`/`QBITTORRENT_PASSWORD` from `.env`.

qBittorrent stores its permanent WebUI credentials in `qBittorrent.conf` as a PBKDF2-SHA512 hash
(100,000 iterations, 64-byte digest, 16-byte random salt), format:
```
WebUI\Password_PBKDF2="@ByteArray(<base64 salt>:<base64 hash>)"
```
`scripts/seed-qbittorrent-password.py` computes this hash from `.env`'s configured password and
writes it (plus `WebUI\Username`) directly into the bind-mounted config file.

**Must be run while the `qbittorrent` container is stopped.** qBittorrent flushes its in-memory
config back to disk on shutdown; editing the file while the process is still running (even briefly)
gets silently overwritten the next time it restarts — this was confirmed empirically (the first
attempt at seeding the password appeared to work, then vanished after a `restart`, because
`restart` stops-then-starts the same process, which flushed stale in-memory state over the edit).
The correct sequence is `docker compose stop qbittorrent` → run the script → `docker compose up -d
qbittorrent`.

## GPU: local-only

See `docs/architecture.md`'s CPU-vs-GPU section. Never apply `docker-compose.gpu.local.yml` to the
actual dedicated server.

## Known gaps

- `torrent-worker`'s `media.downloaded.requestId` is always `null` in practice today — see
  `docs/events.md` and `docs/torrent-worker.md` for why and a suggested fix.
- `transcode-worker`'s Tdarr adapter targets an unversioned, empirically-inferred API — verify
  against your actual running Tdarr version before depending on it, and pin Tdarr's image tag once
  verified (see `docs/transcode-worker.md`).
- API key `scopes` are stored and returned but not yet enforced by any guard (see
  `docs/data-model.md` / `docs/core-api.md`) — every valid key currently has full read access.
- The React admin frontend is out of scope for this phase; Swagger (`core-api`'s `/docs`) is the
  only UI today.
