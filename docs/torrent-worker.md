# torrent-worker (Go)

Wraps qBittorrent's Web API behind a port interface and bridges it to the event bus. Never talks to
Postgres — entirely stateless, reconstructable from qBittorrent + NATS at any time.

## Package map

```
cmd/torrent-worker/main.go        # wiring + the qBittorrent bootstrap sequence
internal/
  domain/torrent.go               # Category, ContentType, FileInfo, TorrentInfo, CompletionEvent
  ports/torrent_client.go         # TorrentClient interface
  ports/event_publisher.go
  adapters/qbittorrent/
    auth.go                       # cookie-session client, transparent re-login
    client.go                     # implements TorrentClient against qBittorrent's Web API v2
  service/
    enqueue_service.go            # consumes torrent.enqueue
    completion_service.go         # handles the on-completion webhook, publishes media.downloaded
  httpserver/router.go, handlers.go   # GET /healthz, POST /hooks/qbittorrent/completed
  messaging/nats.go                # JetStream connect/publish/subscribe, durable consumers
  events/events.go                 # Go structs mirroring shared/events/schemas/*.json
  config/config.go
```

## `TorrentClient` — an Adapter/Strategy port

`internal/ports/torrent_client.go` defines the interface (`Add`, `EnsureCategory`, `GetFiles`,
`GetInfo`); `internal/adapters/qbittorrent/client.go` is the only implementation. This is a
deliberate Adapter (a.k.a. Strategy) pattern: swapping qBittorrent for Transmission or Deluge later
means adding a new `adapters/` package, not touching `enqueue_service.go` or
`completion_service.go`, which only depend on the interface.

## Startup bootstrap (`bootstrapQBittorrent` in `main.go`)

Runs on every container start, and is idempotent by design (safe to re-run):

1. `EnsureCategory` for `movies` (`/data/library/movies`), `tv` (`/data/library/tv`), `music`
   (`/data/library/music`) via `POST /api/v2/torrents/createCategory` — a 409 (category exists with
   a different path) or a 200 with "Category already exists." body are both treated as success.
2. `ConfigureIncompleteDir("/data/incoming")` via `POST /api/v2/app/setPreferences`
   (`temp_path_enabled`, `temp_path`).
3. `ConfigureCompletionHook(...)` — sets `autorun_enabled: true` and `autorun_program` to a `curl`
   command targeting this service's own webhook:
   ```
   curl -s -X POST http://torrent-worker:8090/hooks/qbittorrent/completed \
     -H "Content-Type: application/json" \
     -d "{\"hash\":\"%I\",\"category\":\"%L\",\"savePath\":\"%F\",\"name\":\"%N\"}"
   ```
   qBittorrent substitutes `%I`/`%L`/`%F`/`%N` itself. This requires `curl` inside the qBittorrent
   container — confirmed present in `lscr.io/linuxserver/qbittorrent:latest` (Alpine-based, `curl
   8.21.0`).

**Retry with backoff**: `bootstrapWithRetry` (added after this was found to fail in practice) retries
the whole sequence with exponential backoff (2s → 16s cap) for up to 60 seconds before falling back
to a slower background retry loop (every 30s, indefinitely). This exists because Docker Compose's
`depends_on: [qbittorrent]` only orders *container start*, not qBittorrent's WebUI actually being
ready to accept logins — without retry, a slow qBittorrent boot would permanently fail this
service's bootstrap and require a manual restart.

## Login: accept any 2xx, not just 200

`internal/adapters/qbittorrent/auth.go`'s `login()` treats any `2xx` response as success. qBittorrent's
documented behavior is `200` with body `"Ok."`, but this deployment's qBittorrent build has been
observed returning `204 No Content` on a successful login — pinning the check to exactly `200`
caused every login to be logged as "failed" even when the session cookie was, in fact, set
correctly (the Go `http.Client`'s cookie jar captures `Set-Cookie` regardless of what the caller
does with the status code afterward).

## HTTP server

Listens on a fixed internal port `8090` — **no host port is published** for this service in
`docker-compose.yml`; it's reached only by the qBittorrent container calling its `autorun_program`,
over the compose network, by service name.

- `GET /healthz` — trivial liveness check.
- `POST /hooks/qbittorrent/completed` — parses `{hash, category, savePath, name}`, calls
  `CompletionService.HandleCompletion`, which fetches the real file list via
  `GET /api/v2/torrents/files` and publishes `media.downloaded` (see `docs/events.md`).

## NATS

Subscribes to `torrent.enqueue` (durable consumer `torrent-worker-enqueue`) — decodes the base64
`.torrent`, calls `TorrentClient.Add` with the category's fixed save path. Publishes `media.downloaded`.

## Known limitation: `requestId` correlation

`CompletionEvent.RequestID` exists in `internal/domain/torrent.go` but is **never populated** —
`httpserver/handlers.go`'s webhook parser only reads `hash`/`category`/`savePath`/`name` from
qBittorrent's hook body, because qBittorrent has no placeholder that echoes back an arbitrary value
supplied at torrent-add time. See `docs/events.md`'s note on `media.downloaded.requestId` for the
downstream effect and a suggested fix (tagging the torrent in qBittorrent and reading the tag back).
