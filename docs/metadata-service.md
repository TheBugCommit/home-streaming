# metadata-service (Python / FastAPI)

Enriches transcoded media with real metadata (TMDb for movies/TV, MusicBrainz+Cover Art Archive for
music), and — uniquely among the four services — physically renames/moves TV episode files into
Jellyfin's expected naming convention. Stateless with respect to Postgres: all persistence goes
through `core-api`'s `/internal/*` endpoints (see `docs/events.md`), never a direct DB connection.

## Module map

```
app/
  main.py                    # FastAPI app, lifespan (wires NATS/TMDb/MusicBrainz/core-api clients)
  config.py                  # pydantic-settings
  logging_setup.py           # structlog JSON to stdout
  events/subscriber.py       # JetStream durable pull consumer on media.transcoded
  events/publisher.py        # publishes media.metadata_enriched
  enrichment.py              # EnrichmentService — the three per-contentType flows
  coreapi_client.py          # httpx client for /internal/* (X-Internal-Api-Key header)
  parsing/filename_parser.py # guessit — title/year or series/season/episode from a release filename
  parsing/audio_tags.py      # mutagen-first, guessit-fallback for music
  matching/confidence.py     # rapidfuzz-based title similarity score
  providers/
    base.py                  # MatchResult — normalized shape every provider returns
    tmdb_provider.py          # movie + TV search/details/episode lookup
    musicbrainz_provider.py   # recording search, rate-limited
    coverart_provider.py      # Cover Art Archive front-cover lookup
  tv_layout.py                # builds & performs the Jellyfin-convention file move
```

## Flow: `media.transcoded` → enrichment

`EnrichmentService.handle_transcoded` (`enrichment.py`) branches on the event's `contentType`:

### Movie
1. `parse_video_filename(output_path)` (guessit) for title/year.
2. `TmdbProvider.search_movie(title, year)` — searches, picks the best `title_confidence`-scored
   result, fetches full details (`/movie/{id}?append_to_response=external_ids`) for `imdb_id`,
   `overview`, `runtime`, `poster_path`, etc.
3. `POST /internal/media-items/:id/metadata` with a **flat** `mediaType: "movie"` payload — see
   `docs/events.md` for the exact shape. `release_date` (a full date string from TMDb) is converted
   to a bare `releaseYear` integer before sending, since that's what core-api's schema stores.

### Episode
1. `parse_video_filename` — guessit extracts series title, season number, episode number natively
   from the release filename (no separate TV-specific parser).
2. `TmdbProvider.search_tv(series_title)`, then (if matched) `get_episode(tv_id, season, episode)`
   for the episode's own title/overview/air date.
3. **`POST /internal/series/upsert` first** — with the TMDb series payload + season number. This
   must happen before the file move, because the target folder name uses the *canonical* title
   TMDb/core-api agree on (via the upsert's response), not the raw filename guess — a season pack
   downloaded under a slightly different release-group naming convention should still land in the
   same series folder as episodes downloaded earlier.
4. **Move the file** (`tv_layout.build_episode_target_path` + `move_episode_file`) into
   `<TV_STREAMABLE_ROOT>/<Series Title> (<Year>)/Season NN/<Series Title> - SxxEyy - <Episode
   Title>.<ext>`, using `shutil.move` (atomic on the same filesystem). Idempotency: if the source
   file is already gone (a redelivered event after a prior successful move) but the target already
   exists, this is treated as "already moved" rather than an error.
5. **Then** `POST /internal/media-items/:id/metadata` with `mediaType: "episode"`, the series/season
   ids from step 3's response, and `newFilePath` set to the *post-move* path — so core-api's
   `MediaItem.filePath` is never out of sync with where the file actually is.

### Track
1. `parse_audio_file(output_path)` — reads ID3/FLAC/etc. tags via `mutagen` as the primary source
   (`title`, `artist`, `album`, `tracknumber`, `discnumber`); only falls back to guessit filename
   parsing when tags are missing or insufficient (title+artist both required to trust tags alone).
2. `MusicBrainzProvider.search_recording(title, artist, album)`, then, if a release id is found,
   `CoverArtProvider.get_front_cover_url(release_mbid)` via the Cover Art Archive.
3. `POST /internal/media-items/:id/metadata` with `mediaType: "track"`.

Every flow ends by publishing `media.metadata_enriched` (informational — see `docs/events.md`).

## MusicBrainz rate limiting

MusicBrainz's usage policy caps unauthenticated use at 1 request/second and requires a descriptive
`User-Agent`. `MusicBrainzProvider` enforces this with a single process-wide `asyncio.Lock`-guarded
`_RateLimiter` (`musicbrainz_provider.py`) that sleeps just long enough to pad the gap since the last
call — applied only to MusicBrainz and Cover Art Archive requests, never to TMDb (which allows much
higher throughput and only gets basic 429/5xx retry-with-backoff via `tenacity`). The `User-Agent` is
built from the `MUSICBRAINZ_CONTACT` env var, as MusicBrainz's policy requires contact information.

## Confidence scoring

`matching/confidence.py`'s `title_confidence` is deliberately simple: `rapidfuzz.fuzz.token_sort_ratio`
normalized to `[0, 1]`, nudged ±0.05/-0.15 by a year match/mismatch when known. It is **always**
persisted (via `MetadataEnrichmentJob.confidenceScore` in core-api, see `docs/data-model.md`) even
for a low-confidence or zero match — the point is to have something a future manual-review UI can
surface, not to silently accept or silently discard uncertain matches.

## Config (`config.py`)

Pydantic-settings, all overridable by env var: `NATS_URL`, `CORE_API_INTERNAL_URL`,
`INTERNAL_API_KEY`, `TMDB_API_KEY`, `MUSICBRAINZ_CONTACT`, `TV_STREAMABLE_ROOT` (default
`/data/streamable/tv` — the one filesystem path this service is allowed to write to; see
`docs/architecture.md`'s note on the scoped mount), `NATS_STREAM_NAME`/`NATS_CONSUMER_NAME`/subject
names.
