# transcode-worker

Correlates files handed off to Tdarr's library folders with Tdarr's own transcode job lifecycle,
and tells Jellyfin to refresh once a file is ready. It never asks Tdarr to start transcoding —
Tdarr scans its configured Library folders on its own schedule; this service only observes.

## Flow

1. Consumes `media.transcode_pending` (durable JetStream consumer `transcode-worker`).
2. Polls Tdarr every 15s for the file's status (`internal/adapters/tdarr`), publishing
   `media.transcode_status_changed` on every observed transition.
3. On terminal success, publishes `media.transcoded` and calls Jellyfin's library refresh
   (`internal/adapters/jellyfin`).
4. Acks the originating message only once the job reaches a terminal state — a crash mid-poll
   just means JetStream redelivers after `AckWait` (2h) and polling resumes; there is no local
   state file to go stale or need to be volume-mounted.

## Known gap: Tdarr API shape needs empirical verification

`internal/adapters/tdarr/client.go` implements `FindJobStatus` against `/api/v2/client/status`
(active workers) and `/api/v2/cruddb` (per-library file records), which is the most plausible
shape based on Tdarr's server source and community tooling — but Tdarr does not publish a
versioned API spec the way qBittorrent does. **Before relying on this in anything but a dry run**,
bring up `tdarr` (`docker compose up -d tdarr`), watch the requests its own web UI
(`localhost:8265`) makes in the browser network tab, and correct the request/response shapes in
that one file if they differ — the `ports.TdarrClient` interface means nothing else needs to
change.

Also currently missing: Tdarr's own per-Library IDs (distinct from the `JELLYFIN_*_LIBRARY_ID`
env vars this service already receives) aren't wired into `docker-compose.yml` yet. Once the
Tdarr Libraries described in `tdarr/flows/README.md` are created via its UI, add their ids as
`TDARR_MOVIES_LIBRARY_ID` / `TDARR_TV_LIBRARY_ID` / `TDARR_MUSIC_LIBRARY_ID` to this service's
`environment:` block in `docker-compose.yml`. Without them, jobs will correctly report
`transcoding` (via the active-workers check) but never resolve to `completed`.

## Build

```
go build ./...
go vet ./...
docker build .
```
