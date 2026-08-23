# Events & pipeline walkthrough

Schemas: `shared/events/schemas/*.json` (JSON Schema, one file per event — treat these as the wire
contract; this document explains *why* each event exists and links it to the code that
publishes/consumes it). Bus: NATS JetStream, stream `HOMESTREAM_EVENTS`, subjects `torrent.*` and
`media.*`, durable consumer per subscribing service (so a service restart resumes rather than
missing events).

## End-to-end walkthrough: one torrent, start to finish

1. An admin calls `POST /api/v1/torrents` (multipart `.torrent` file + `contentType`) on `core-api`.
   `SubmitTorrentUseCase` (`services/core-api/src/application/torrents/submit-torrent.use-case.ts`)
   creates a `Torrent` row (status `queued`) and publishes **`torrent.enqueue`** — using the new
   `Torrent.id` itself as the event's `requestId`, so no separate id-generation/lookup is needed.

2. `torrent-worker`'s `EnqueueService` (`internal/service/enqueue_service.go`) consumes
   `torrent.enqueue`, decodes the base64 `.torrent` file, and calls qBittorrent's
   `POST /api/v2/torrents/add` with the category's fixed save path (`/data/library/<category>`, set
   explicitly per call — not qBittorrent's Automatic Torrent Management path inference).

3. Time passes; qBittorrent downloads the torrent into `incoming/`, then moves it to
   `library/<category>/` on completion and invokes its own `autorun_program` hook (configured once
   at `torrent-worker` startup — see `docs/torrent-worker.md`), which `curl`s
   `POST http://torrent-worker:8090/hooks/qbittorrent/completed` with `{hash, category, savePath,
   name}`.

4. `torrent-worker`'s `CompletionService` (`internal/service/completion_service.go`) receives that
   webhook, calls qBittorrent's `torrents/files` API to get the real file list, and publishes
   **`media.downloaded`** — one event per *torrent* (not per file; the event carries a `files` array,
   so a season-pack's 10 episodes are still one event).

5. `core-api`'s `MediaDownloadedSubscriber` → `ProcessMediaDownloadedUseCase`
   (`services/core-api/src/application/media/process-media-downloaded.use-case.ts`) consumes it:
   for each file, creates one `MediaItem` (type derived from the event's `category`: movies→movie,
   tv→episode, music→track; title derived by stripping the extension and replacing `.`/`_` with
   spaces — a placeholder until `metadata-service` overwrites it with the real title) and one
   `TranscodeJob`, then publishes **`media.transcode_pending`** per file. If the event's `requestId`
   matches a known `Torrent`, that torrent's status is marked `completed` and linked as the media
   item's `sourceTorrentId`.

6. `transcode-worker`'s `Poller` (`internal/correlation/poller.go`) consumes
   `media.transcode_pending` and starts polling Tdarr's API every 15s for a job/file record matching
   the source path — **it never tells Tdarr to start transcoding**; Tdarr already auto-scans its own
   Library folders (`library/{movies,tv,music}`) on its own schedule. On every observed status
   change it publishes **`media.transcode_status_changed`**; on terminal success it publishes
   **`media.transcoded`** and calls Jellyfin's refresh endpoint for the matching library.

7. `core-api`'s `TranscodeEventsSubscriber` persists both: status changes go to
   `TranscodeStatusHistory`, and `media.transcoded` triggers `TranscodeJobRepository.recordTranscoded`,
   which atomically updates *both* the `TranscodeJob` (output path, sizes, codecs, status
   `completed`) *and* the `MediaItem` itself (`status: 'transcoded'`, `filePath` now pointing at the
   `streamable/` output, codecs/size updated) — see
   `services/core-api/src/infrastructure/persistence/repositories/transcode-job.repository.ts`.

8. `metadata-service` also consumes `media.transcoded` independently (same event, two subscribers).
   It calls `GET /internal/media-items/:id` for context, parses the filename (and, for audio, reads
   tags), queries TMDb or MusicBrainz, and (for episodes) moves the file into Jellyfin's TV naming
   convention — see `docs/metadata-service.md`. It then calls back into `core-api` via
   `POST /internal/media-items/:id/metadata` to persist the enrichment, and publishes
   **`media.metadata_enriched`** (informational only — no current subscriber; reserved for a future
   search index or similar).

## Event catalog

| subject | publisher | consumer(s) | schema |
|---|---|---|---|
| `torrent.enqueue` | core-api | torrent-worker | `shared/events/schemas/torrent.enqueue.v1.json` |
| `media.downloaded` | torrent-worker | core-api | `shared/events/schemas/media.downloaded.v1.json` |
| `media.transcode_pending` | core-api | transcode-worker | `shared/events/schemas/media.transcode_pending.v1.json` |
| `media.transcode_status_changed` | transcode-worker | core-api | `shared/events/schemas/media.transcode_status_changed.v1.json` |
| `media.transcoded` | transcode-worker | core-api, metadata-service | `shared/events/schemas/media.transcoded.v1.json` |
| `media.metadata_enriched` | metadata-service | *(none yet — reserved)* | `shared/events/schemas/media.metadata_enriched.v1.json` |

### `torrent.enqueue`
```json
{
  "requestId": "uuid",
  "contentType": "movie | tv | music",
  "category": "movies | tv | music",
  "torrentFileBase64": "...",
  "submittedByUserId": "uuid",
  "submittedAt": "2026-07-29T20:21:47.479Z"
}
```

### `media.downloaded`
```json
{
  "torrentHash": "4055bbdf8af6114c3da93ed4caaeaa6625e87f9b",
  "requestId": "uuid | null",
  "contentType": "movie | tv | music",
  "category": "movies | tv | music",
  "completedAt": "2026-07-29T20:24:00Z",
  "files": [
    { "relativePath": "Movie.Name.mkv", "absolutePath": "/data/library/movies/Movie.Name.mkv",
      "sizeBytes": 1234567, "fileExtension": "mkv" }
  ]
}
```
**`requestId` is currently always `null` in practice.** qBittorrent's on-completion hook only ever
receives `%I` (hash) / `%L` (category) / `%F` (save path) / `%N` (name) from qBittorrent itself —
there is no qBittorrent placeholder that echoes back an arbitrary value we supplied at submission
time, and `torrent-worker`'s `httpserver/handlers.go` never populates `CompletionEvent.RequestID`.
`core-api`'s `ProcessMediaDownloadedUseCase` handles this gracefully (logs a warning, proceeds
without a `sourceTorrentId` link) rather than failing, so the pipeline still works — but the
`Torrent` row for that download is never automatically marked `completed` or linked to its
resulting `MediaItem`s today. A real fix would tag the torrent in qBittorrent with the `requestId`
(qBittorrent supports arbitrary tags) and read the tag back in the completion handler.

### `media.transcode_pending`
```json
{ "transcodeJobId": "uuid", "mediaItemId": "uuid", "contentType": "movie | episode | track",
  "sourcePath": "/data/library/movies/Movie.Name.mkv" }
```

### `media.transcode_status_changed`
```json
{ "transcodeJobId": "uuid", "mediaItemId": "uuid",
  "status": "queued | transcoding | completed | failed | skipped",
  "detail": { "...": "raw Tdarr record snapshot" }, "occurredAt": "2026-07-29T20:25:00Z" }
```

### `media.transcoded`
```json
{ "mediaItemId": "uuid", "transcodeJobId": "uuid", "contentType": "movie | episode | track",
  "outputPath": "/data/streamable/movies/Movie.Name.mkv", "status": "completed | skipped",
  "sizeBeforeBytes": 4000000000, "sizeAfterBytes": 2100000000,
  "videoCodec": "h264", "audioCodec": "aac", "containerFormat": "mkv",
  "occurredAt": "2026-07-29T20:40:00Z" }
```

### `media.metadata_enriched`
```json
{ "mediaItemId": "uuid", "provider": "tmdb | musicbrainz",
  "matchedExternalId": "603", "confidence": 0.92, "occurredAt": "2026-07-29T20:41:00Z" }
```

## Internal synchronous HTTP (not events)

All under `core-api`'s `/internal/*` prefix (excluded from the `/api/v1` global prefix — see
`main.ts`), guarded by `InternalKeyGuard` comparing the `X-Internal-Api-Key` header against
`INTERNAL_API_KEY`. Never published to a host port — only reachable by other containers on the
compose network. Used exclusively by `metadata-service` today.

- **`GET /internal/media-items/:id`** — returns the current `MediaItem` (via
  `GetMediaDetailUseCase`), so `metadata-service` has context (e.g. a placeholder title) before
  querying providers.

- **`POST /internal/media-items/:id/metadata`** — a single **flat, `mediaType`-discriminated** body
  (see `services/core-api/src/infrastructure/http/dto/internal.dto.ts`'s `ApplyMetadataDto` — *not*
  nested `movie`/`episode`/`track` sub-objects):
  ```json
  { "mediaType": "movie", "tmdbId": 603, "imdbId": "tt0133093", "overview": "...",
    "runtimeMinutes": 136, "originalLanguage": "en", "posterPath": "/...", "backdropPath": "/...",
    "releaseYear": 1999 }
  ```
  ```json
  { "mediaType": "episode", "seriesId": "uuid", "seasonId": "uuid", "episodeNumber": 3,
    "overview": "...", "airDate": "2008-02-24", "episodeTitle": "...And the Bag's in the River",
    "newFilePath": "/data/streamable/tv/Breaking Bad (2008)/Season 01/Breaking Bad - S01E03 - ....mkv" }
  ```
  ```json
  { "mediaType": "track", "musicbrainzRecordingId": "...", "musicbrainzReleaseId": "...",
    "artistName": "...", "albumName": "...", "trackNumber": 4, "discNumber": null,
    "coverArtUrl": "https://..." }
  ```
  For `episode`, `seriesId`/`seasonId` are required (the controller throws otherwise) — always call
  `/internal/series/upsert` first and use *its* returned ids, not values you invented.

- **`POST /internal/series/upsert`** — find-or-create by `tmdbId`, so repeated episodes of the same
  show (arriving in separate torrents, possibly weeks apart) resolve to one `Series`/`Season` row
  instead of duplicating it:
  ```json
  { "tmdbId": 1396, "title": "Breaking Bad", "overview": "...", "firstAirDate": "2008-01-20",
    "posterPath": "/...", "backdropPath": "/...", "seasonNumber": 1 }
  ```
  **Response shape is nested, not flat** — `{ "series": { "id", "tmdbId", "title", ... },
  "season": { "id", "seriesId", "seasonNumber" } }` (see
  `services/core-api/src/domain/series/series.entity.ts`'s `UpsertSeriesResult`). Read
  `response.series.id` / `response.season.id` / `response.series.title` — not a flat
  `seriesId`/`seasonId`/`seriesTitle` on the top-level response.
