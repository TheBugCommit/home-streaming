# Data model

Source of truth: `services/core-api/prisma/schema.prisma`. Postgres is owned exclusively by
`core-api` — no other service ever connects to it directly (see `docs/architecture.md`). All
primary keys are UUIDs (`gen_random_uuid()`-equivalent via Prisma's `@default(uuid())`).

## Auth & users

- **`User`** — `email` (unique), `passwordHash` (argon2), `displayName`, `role` (`admin` | `viewer`),
  `isActive`. The one admin bootstrapped at startup from `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD`
  (see `docs/core-api.md`) — there is no public self-registration endpoint.
- **`RefreshToken`** — `userId` FK, `tokenHash` (sha256 of the opaque refresh token — never the raw
  value), `expiresAt`, `revokedAt`. Exists specifically so refresh tokens are *revocable*; a purely
  stateless JWT refresh token couldn't be invalidated on logout.
- **`ApiKey`** — `ownerUserId` FK, `keyPrefix` (first 8 hex chars of the raw key, for fast lookup),
  `keyHash` (sha256 of the full raw key — not argon2, since API keys are already high-entropy random
  tokens, not human passwords), `scopes` (jsonb array, e.g. `["media:read"]`), `expiresAt`,
  `lastUsedAt`, `revokedAt`. **Current limitation:** `scopes` is stored and returned to the client but
  not yet enforced by any guard — every valid, non-revoked API key currently has the same read
  access regardless of its `scopes` value. Treat it as a reservation for future per-endpoint
  authorization, not a working restriction today.

## Media

- **`MediaItem`** — the polymorphic core of the library. `type` (`movie` | `episode` | `track`),
  `title`, `sortTitle`, `releaseYear`, `durationSeconds`, `filePath` (path under `streamable/`),
  `fileSizeBytes`, `containerFormat`, `videoCodec`, `audioCodec`, `resolution`, `status`
  (`pending → downloading → downloaded → transcoding → transcoded → ready | failed`),
  `sourceTorrentId` FK (nullable — see `Torrent` below), free-form `metadata` jsonb for anything not
  worth a dedicated column. One row per *file*, not per torrent — a season-pack torrent produces one
  `MediaItem` per episode file.
- **`MovieDetails`** (1:1, PK = `mediaItemId`, only when `type = movie`) — `tmdbId`, `imdbId`,
  `overview`, `runtimeMinutes`, `originalLanguage`, `posterPath`, `backdropPath`.
- **`EpisodeDetails`** (1:1, PK = `mediaItemId`, only when `type = episode`) — `seriesId` FK,
  `seasonId` FK, `episodeNumber`, `imdbId`, `overview`, `airDate`.
- **`TrackDetails`** (1:1, PK = `mediaItemId`, only when `type = track`) — `musicbrainzRecordingId`,
  `musicbrainzReleaseId`, `artistName`, `albumName`, `trackNumber`, `discNumber`, `coverArtUrl`.

These three are separate 1:1 side-tables rather than one wide `MediaItem` table with a pile of
nullable columns, because a movie's fields (runtime, TMDb id) and a track's fields (MusicBrainz
recording id, disc number) share almost nothing — a single wide table would mean every row has half
its columns permanently null and no type-level guarantee that a `track` never has a `runtimeMinutes`.

## TV series aggregate

- **`Series`** — `tmdbId` (unique), `title`, `overview`, `firstAirDate`, `posterPath`,
  `backdropPath`, `status` (`ongoing` | `ended`). Upserted idempotently by `tmdbId` so that episodes
  from different torrents (different seasons downloaded weeks apart) resolve to the same `Series`
  row rather than duplicating it — see `POST /internal/series/upsert` in `docs/events.md`.
- **`Season`** — `seriesId` FK, `seasonNumber`, `tmdbId`, `overview`, `posterPath`. Unique on
  `(seriesId, seasonNumber)`.

`EpisodeDetails` links to both `Series` and `Season` directly (not just through `Season`) so a
single join gets a series' episodes without an extra hop.

## Taxonomy

- **`Genre`** + **`MediaItemGenre`** (movie/track M:N) + **`SeriesGenre`** (series M:N) —
  provider-sourced taxonomy (TMDb/MusicBrainz genres, e.g. "Action", "Rock"). Series genres are
  attached at the `Series` level (TMDb genres are naturally series-wide) rather than duplicated onto
  every episode row.
- **`Category`** + **`MediaItemCategory`** (M:N) — a *separate*, admin-curated taxonomy (e.g. "Kids",
  "Documentaries"), distinct from provider genres, since one is external/objective and the other is
  a local, user-defined organizing scheme with its own CRUD (`docs/core-api.md`'s
  `CategoriesController`).

## Torrents & pipeline history

- **`Torrent`** — `contentType` (`movie` | `tv` | `music`), `categoryLabel` (the qBittorrent
  category, currently identical to `contentType` for movies/music and `"tv"` for tv), `qbittorrentHash`
  (unique, nullable until the completion webhook reports it), `originalTorrentFilename`, `savePath`,
  `status` (`queued → downloading → completed | error`), `progressPercent`, `submittedByUserId` FK.
  One `Torrent` → many `MediaItem` (`MediaItem.sourceTorrentId`), because a season-pack or
  multi-track album torrent yields multiple files/media items from one submission.
- **`DownloadStatusHistory`** — append-only audit trail of a `Torrent`'s status transitions.
- **`TranscodeJob`** — `mediaItemId` FK, `sourcePath`, `outputPath`, `status`
  (`queued → transcoding → completed | failed | skipped`), `sizeBeforeBytes`/`sizeAfterBytes`,
  `videoCodecBefore`/`videoCodecAfter`. One `TranscodeJob` per `MediaItem` (created immediately when
  `media.downloaded` is processed, before Tdarr has necessarily even scanned the file yet).
- **`TranscodeStatusHistory`** — append-only audit trail mirroring `DownloadStatusHistory`, one row
  per `media.transcode_status_changed` event `transcode-worker` observes from Tdarr.
- **`MetadataEnrichmentJob`** — `mediaItemId` FK, `provider` (`tmdb` | `musicbrainz`), `status`,
  `rawResponse` jsonb, `matchedExternalId`, `confidenceScore`. Kept even for low-confidence matches
  (never silently discarded) so a future manual-review UI has something to show — see
  `docs/metadata-service.md`'s confidence scoring.

## Enums (as declared in `schema.prisma`)

| enum | values |
|---|---|
| `UserRole` | `admin`, `viewer` |
| `MediaType` | `movie`, `episode`, `track` |
| `MediaStatus` | `pending`, `downloading`, `downloaded`, `transcoding`, `transcoded`, `ready`, `failed` |
| `ContentType` | `movie`, `tv`, `music` (the *torrent-level* category — distinct from `MediaType`, which is the *file-level* type; a `tv` torrent's files become `episode` media items) |
| `TorrentStatus` | `queued`, `downloading`, `completed`, `error` |
| `TranscodeStatus` | `queued`, `transcoding`, `completed`, `failed`, `skipped` |
| `MetadataProvider` | `tmdb`, `musicbrainz` |
| `SeriesStatus` | `ongoing`, `ended` |
