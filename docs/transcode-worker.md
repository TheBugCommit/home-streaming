# transcode-worker (Go)

Correlates a known downloaded file with Tdarr's own transcode queue, and triggers a Jellyfin
library refresh once Tdarr is done. Like torrent-worker, entirely stateless with respect to
Postgres — it only knows about the one job it's currently polling.

## Package map

```
cmd/transcode-worker/main.go
internal/
  domain/transcodejob.go         # PendingJob, TdarrJobStatus, Status enum
  ports/tdarr_client.go, jellyfin_client.go, event_publisher.go
  adapters/tdarr/client.go       # implements TdarrClient — see caveat below
  adapters/jellyfin/client.go    # implements JellyfinClient
  correlation/poller.go          # the core responsibility, see below
  messaging/nats.go
  config/config.go
```

## Why this service never "triggers" a transcode

Tdarr auto-scans its own configured Library source folders (`library/{movies,tv,music}`) on its own
schedule — this service has no API call that means "start transcoding this file." Its entire job is
*correlation*: given a `sourcePath` it was told about via `media.transcode_pending`, repeatedly ask
Tdarr what it currently thinks about that path, and translate Tdarr's state into this system's own
domain events.

## The poller (`internal/correlation/poller.go`)

`Poller.Handle` is called once per `media.transcode_pending` message (JetStream dispatches each
message on its own goroutine already, so `Handle` can safely block for the job's entire lifetime
without extra goroutine management). It:

1. Guards against duplicate concurrent handling of the same `transcodeJobId` via an in-memory
   `inFlight` map (relevant on redelivery).
2. Ticks every `interval` (poll period), calling `inProgress()` each tick to tell JetStream this
   message is still being actively worked (extends the ack deadline) and `tdarr.FindJobStatus(...)`.
3. On any status change vs. the last observed one, publishes `media.transcode_status_changed`.
4. On terminal `completed`/`skipped`, publishes `media.transcoded`, calls
   `jellyfin.RefreshLibrary(...)` for the content type's configured library id, `ack()`s the message,
   and returns.
5. On terminal `failed`, `ack()`s and returns without retrying further — a job Tdarr has given up on
   won't un-fail itself.

**Restart survival**: there is no local state file. If this container restarts mid-poll, the
in-memory `inFlight` map is lost, but the JetStream message for `media.transcode_pending` was never
`ack()`'d (only `inProgress()`'d), so JetStream redelivers it after the ack-wait window expires, and
`Handle` starts polling again from scratch. This is simpler than persisting poll state to disk, at
the cost of a delay (bounded by the ack-wait timeout) before polling resumes after a crash.

## Tdarr adapter — **unverified against a real API spec**

Unlike qBittorrent, Tdarr does not publish a stable, versioned API for "find this file's job status
by path." `internal/adapters/tdarr/client.go`'s header comment states this explicitly. Current
implementation assumes:

1. `POST /api/v2/client/status` returns currently-active worker records with a `file` field
   substring-matchable against a known `sourcePath` (used to detect "currently transcoding").
2. `POST /api/v2/cruddb` with `{"data": {"collection": "<TdarrLibraryID>", "mode": "getAll"}}`
   lists a Library's known file records, each exposing enough of ffprobe's summarized output
   (`TranscodeDecisionMaker`, `transcode` bool, `outputFilePath`, `file_size`,
   `TranscodeOutputFileSize`, `videoCodec`, `audioCodec`, `container`, `HasError`) to fill in
   before/after size and codec info once a transcode completes.

**Before relying on this in production**, verify these shapes against a real running Tdarr instance
(inspect the network requests Tdarr's own web UI makes at `localhost:8265`), and pin Tdarr to a
specific image tag rather than `:latest` once confirmed, so the API doesn't shift under you.

Tdarr Library IDs (an id Tdarr assigns internally per Library, distinct from the Jellyfin library
ids this service also uses) are read from `TDARR_MOVIES_LIBRARY_ID` / `TDARR_TV_LIBRARY_ID` /
`TDARR_MUSIC_LIBRARY_ID` and mapped to a content type via `libraryIDForPath`, which matches on the
`/library/<category>/` path segment. **If a library id isn't configured for a content type, queries
for that type are skipped entirely (job stays `queued` forever) rather than guessing which Tdarr
Library to search** — see `docs/operations.md` for where to get these ids.

## Jellyfin adapter

`RefreshLibrary(libraryID)`: if a library id is configured, calls the targeted
`POST /Items/{itemId}/Refresh?Recursive=true&...` (a Jellyfin library counts as an "Item" in its own
model); otherwise falls back to a full `POST /Library/Refresh`. Auth via `X-Emby-Token` header set to
`JELLYFIN_API_KEY`.
