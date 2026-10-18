# Model de dades v2 (Postgres)

Postgres és propietat exclusiva del backend. Claus primàries: `uuid` (o `bigserial` on no calgui
exposar-les). Tots els `timestamp` amb zona horària.

## Comptes i autenticació

### `users`

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text unique | |
| `password_hash` | text | argon2id |
| `display_name` | text | |
| `role` | text | `admin` \| `viewer` |
| `is_active` | bool | |
| `created_at` / `updated_at` | timestamptz | |

### `refresh_tokens`

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `token_hash` | text | sha256 del token opac (mai el valor en cru) |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz null | |

Els refresh tokens són valors opacs revocables (no JWT), rotats a cada ús, perquè el logout pugui
invalidar-los de debò.

## Perfils de transcodificació

### `transcode_profiles`

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text unique | p. ex. `h264_1080p` |
| `description` | text | etiqueta per a la UI |
| `container` | text | `mp4` \| `mkv` |
| `video_codec` | text | `h264` \| `hevc` \| `copy` |
| `encoder` | text | `h264_qsv` \| `hevc_qsv` \| `libx264` \| `copy` |
| `quality` | int | `global_quality`/CRF |
| `max_width` / `max_height` | int null | escalat opcional |
| `audio_codec` | text | `aac` \| `copy` |
| `audio_bitrate_kbps` | int null | |
| `audio_channels` | int null | p. ex. 2 (downmix) |
| `subtitle_mode` | text | `copy` \| `burn` \| `none` |
| `extra_args` | jsonb | arguments ffmpeg addicionals |
| `is_default` | bool | el que surt seleccionat per defecte |
| `created_at` | timestamptz | |

Es *seedegen* perfils per defecte en la primera migració; vegeu [transcoding.md](transcoding.md).

## Catàleg

### `media_items`

Ítem polimòrfic: una fila per **fitxer**.

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `type` | text | `movie` \| `episode` |
| `title` | text | |
| `sort_title` | text | |
| `release_year` | int null | |
| `duration_seconds` | int null | |
| `file_path` | text null | ruta relativa dins de `library/` |
| `file_size_bytes` | bigint null | |
| `container_format` | text null | |
| `video_codec` / `audio_codec` | text null | |
| `resolution` | text null | p. ex. `1920x1080` |
| `status` | text | vegeu l'enum de `media_status` |
| `source_torrent_id` | uuid FK → torrents null | |
| `tmdb_id` | text null | |
| `jellyfin_item_id` | text null | ítem corresponent a Jellyfin |
| `metadata` | jsonb | camps solts no mereixedors de columna |
| `created_at` / `updated_at` | timestamptz | |

### `movies` (1:1, només `type = movie`)

`media_item_id` PK/FK, `imdb_id`, `overview`, `runtime_minutes`, `original_language`,
`poster_path`, `backdrop_path`.

### `series`

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `tmdb_id` | text unique | |
| `jellyfin_item_id` | text null | |
| `title` | text | |
| `overview` | text | |
| `first_air_date` | date null | |
| `poster_path` / `backdrop_path` | text null | |
| `status` | text | `ongoing` \| `ended` |

Es fa *upsert* per `tmdb_id`, de manera que episodis de torrents diferents (temporades baixades amb
setmanes de diferència) acaben a la mateixa fila de `series`.

### `seasons`

`id` PK, `series_id` FK, `season_number`, `tmdb_id`, `overview`, `poster_path`.
Únic per `(series_id, season_number)`.

### `episodes` (1:1, només `type = episode`)

`media_item_id` PK/FK, `series_id` FK, `season_id` FK, `episode_number`, `imdb_id`, `overview`,
`air_date`.

### `genres` + `media_item_genres`

Taxonomia provinent del proveïdor (TMDb/Jellyfin). `media_item_genres(media_item_id, genre_id)`.

> `series_genres` s'afegeix si cal associar gèneres a nivell de sèrie en lloc d'episodi.

## Pipeline

### `torrents`

| columna | tipus | notes |
|---|---|---|
| `id` | uuid PK | |
| `content_type` | text | `movie` \| `tv` |
| `category_label` | text | categoria de qBittorrent |
| `qbittorrent_hash` | text unique null | |
| `original_torrent_filename` | text null | |
| `save_path` | text | |
| `transcode_profile_id` | uuid FK → transcode_profiles | perfil triat en pujar |
| `status` | text | `queued` \| `downloading` \| `completed` \| `error` |
| `progress_percent` | numeric | |
| `state` | text null | estat intern de qBittorrent (`downloading`, `stalledDL`, `checkingDL`, `uploading`, ...) |
| `downloaded_bytes` / `total_bytes` | bigint | |
| `download_speed_bps` / `upload_speed_bps` | bigint | |
| `eta_seconds` | int null | temps restant estimat |
| `seeders` / `leechers` | int | |
| `last_error` | text null | darrer error reportat per qBittorrent (tracker, etc.) |
| `submitted_by_user_id` | uuid FK → users | |
| `created_at` / `updated_at` | timestamptz | |

Un torrent → molts `media_items`.

### `transcode_jobs`

Un `media_item` pot tenir **diverses** files al llarg del temps: una en la pujada inicial i una per
cada re-transcodificació feta des del catàleg (`POST /api/media/:id/transcode`).

`id` PK, `media_item_id` FK, `profile_id` FK, `source_path`, `output_path`, `status`
(`queued` \| `transcoding` \| `completed` \| `failed` \| `skipped`), `progress_percent`,
`eta_seconds` (int null), `speed_x` (numeric null), `fps` (numeric null), `elapsed_seconds` (int null),
`size_before_bytes`, `size_after_bytes`, `video_codec_before` / `video_codec_after`,
`ffmpeg_log` (text), `error` (text), `started_at` / `finished_at`, timestamps.

### `metadata_lookups`

`id` PK, `media_item_id` FK, `provider` (`tmdb` \| `jellyfin`), `query` (text), `status`,
`raw_response` jsonb, `matched_external_id`, `confidence_score`, timestamps. Es conserven fins i tot
els resultats de baixa confiança per a una futura revisió manual.

### `pipeline_events`

Registre append-only que alimenta el progrés i, sobretot, la **visualització d'errors** a la UI.
Es conserva encara que la feina acabi (històric complet per ítem).

| columna | tipus | notes |
|---|---|---|
| `id` | bigserial PK | |
| `media_item_id` | uuid FK → media_items null | |
| `torrent_id` | uuid FK → torrents null | |
| `job_id` | bigint FK → jobs null | |
| `stage` | text | `download` \| `transcode` \| `identify` \| `publish` \| `enrich` |
| `level` | text | `info` \| `warning` \| `error` |
| `message` | text | text llegible per a la UI |
| `details` | jsonb | dades crues (codi ffmpeg, log, estat de tracker, mètriques…) |
| `created_at` | timestamptz | |

### `jobs` (cua genèrica)

| columna | tipus | notes |
|---|---|---|
| `id` | bigserial PK | |
| `kind` | text | `poll_torrent` \| `on_download_complete` \| `transcode` \| `identify` \| `publish` \| `enrich` |
| `payload` | jsonb | ids i paràmetres |
| `status` | text | `queued` \| `running` \| `done` \| `failed` |
| `priority` | int | |
| `attempts` | int | |
| `max_attempts` | int | |
| `run_after` | timestamptz | reintents amb backoff |
| `last_error` | text null | |
| `locked_by` | text null | id del worker |
| `created_at` / `started_at` / `finished_at` | timestamptz | |

Índex parcial sobre `(status, run_after, priority)` per al `FOR UPDATE SKIP LOCKED`.

## Enums

| enum | valors |
|---|---|
| `user_role` | `admin`, `viewer` |
| `media_type` | `movie`, `episode` |
| `media_status` | `queued`, `downloading`, `downloaded`, `transcoding`, `transcoded`, `identifying`, `publishing`, `ready`, `failed` |
| `content_type` | `movie`, `tv` |
| `torrent_status` | `queued`, `downloading`, `completed`, `error` |
| `transcode_status` | `queued`, `transcoding`, `completed`, `failed`, `skipped` |
| `metadata_provider` | `tmdb`, `jellyfin` |
| `series_status` | `ongoing`, `ended` |
| `job_status` | `queued`, `running`, `done`, `failed` |
