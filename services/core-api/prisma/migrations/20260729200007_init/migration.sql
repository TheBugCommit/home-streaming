-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'viewer');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('movie', 'episode', 'track');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'downloading', 'downloaded', 'transcoding', 'transcoded', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('movie', 'tv', 'music');

-- CreateEnum
CREATE TYPE "TorrentStatus" AS ENUM ('queued', 'downloading', 'completed', 'error');

-- CreateEnum
CREATE TYPE "TranscodeStatus" AS ENUM ('queued', 'transcoding', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "MetadataProvider" AS ENUM ('tmdb', 'musicbrainz');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('ongoing', 'ended');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_items" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "title" TEXT NOT NULL,
    "sort_title" TEXT,
    "release_year" INTEGER,
    "duration_seconds" INTEGER,
    "file_path" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "container_format" TEXT,
    "video_codec" TEXT,
    "audio_codec" TEXT,
    "resolution" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'pending',
    "source_torrent_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_details" (
    "media_item_id" TEXT NOT NULL,
    "tmdb_id" INTEGER,
    "imdb_id" TEXT,
    "overview" TEXT,
    "runtime_minutes" INTEGER,
    "original_language" TEXT,
    "poster_path" TEXT,
    "backdrop_path" TEXT,

    CONSTRAINT "movie_details_pkey" PRIMARY KEY ("media_item_id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "first_air_date" TIMESTAMP(3),
    "poster_path" TEXT,
    "backdrop_path" TEXT,
    "status" "SeriesStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "tmdb_id" INTEGER,
    "overview" TEXT,
    "poster_path" TEXT,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_details" (
    "media_item_id" TEXT NOT NULL,
    "series_id" TEXT,
    "season_id" TEXT,
    "episode_number" INTEGER,
    "imdb_id" TEXT,
    "overview" TEXT,
    "air_date" TIMESTAMP(3),

    CONSTRAINT "episode_details_pkey" PRIMARY KEY ("media_item_id")
);

-- CreateTable
CREATE TABLE "track_details" (
    "media_item_id" TEXT NOT NULL,
    "musicbrainz_recording_id" TEXT,
    "musicbrainz_release_id" TEXT,
    "artist_name" TEXT,
    "album_name" TEXT,
    "track_number" INTEGER,
    "disc_number" INTEGER,
    "cover_art_url" TEXT,

    CONSTRAINT "track_details_pkey" PRIMARY KEY ("media_item_id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_item_genres" (
    "media_item_id" TEXT NOT NULL,
    "genre_id" TEXT NOT NULL,

    CONSTRAINT "media_item_genres_pkey" PRIMARY KEY ("media_item_id","genre_id")
);

-- CreateTable
CREATE TABLE "series_genres" (
    "series_id" TEXT NOT NULL,
    "genre_id" TEXT NOT NULL,

    CONSTRAINT "series_genres_pkey" PRIMARY KEY ("series_id","genre_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_item_categories" (
    "media_item_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "media_item_categories_pkey" PRIMARY KEY ("media_item_id","category_id")
);

-- CreateTable
CREATE TABLE "torrents" (
    "id" TEXT NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "category_label" TEXT NOT NULL,
    "qbittorrent_hash" TEXT,
    "original_torrent_filename" TEXT NOT NULL,
    "save_path" TEXT NOT NULL,
    "status" "TorrentStatus" NOT NULL DEFAULT 'queued',
    "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submitted_by_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "torrents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_status_history" (
    "id" TEXT NOT NULL,
    "torrent_id" TEXT NOT NULL,
    "status" "TorrentStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "download_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcode_jobs" (
    "id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "output_path" TEXT,
    "status" "TranscodeStatus" NOT NULL DEFAULT 'queued',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "size_before_bytes" BIGINT,
    "size_after_bytes" BIGINT,
    "video_codec_before" TEXT,
    "video_codec_after" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcode_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcode_status_history" (
    "id" TEXT NOT NULL,
    "transcode_job_id" TEXT NOT NULL,
    "status" "TranscodeStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "transcode_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_enrichment_jobs" (
    "id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "provider" "MetadataProvider" NOT NULL,
    "status" TEXT NOT NULL,
    "raw_response" JSONB,
    "matched_external_id" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_owner_user_id_idx" ON "api_keys"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "media_items_type_idx" ON "media_items"("type");

-- CreateIndex
CREATE INDEX "media_items_status_idx" ON "media_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "series_tmdb_id_key" ON "series"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_series_id_season_number_key" ON "seasons"("series_id", "season_number");

-- CreateIndex
CREATE INDEX "episode_details_series_id_idx" ON "episode_details"("series_id");

-- CreateIndex
CREATE INDEX "episode_details_season_id_idx" ON "episode_details"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "torrents_qbittorrent_hash_key" ON "torrents"("qbittorrent_hash");

-- CreateIndex
CREATE INDEX "download_status_history_torrent_id_idx" ON "download_status_history"("torrent_id");

-- CreateIndex
CREATE INDEX "transcode_jobs_media_item_id_idx" ON "transcode_jobs"("media_item_id");

-- CreateIndex
CREATE INDEX "transcode_status_history_transcode_job_id_idx" ON "transcode_status_history"("transcode_job_id");

-- CreateIndex
CREATE INDEX "metadata_enrichment_jobs_media_item_id_idx" ON "metadata_enrichment_jobs"("media_item_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_source_torrent_id_fkey" FOREIGN KEY ("source_torrent_id") REFERENCES "torrents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_details" ADD CONSTRAINT "movie_details_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_details" ADD CONSTRAINT "episode_details_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_details" ADD CONSTRAINT "episode_details_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_details" ADD CONSTRAINT "episode_details_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_details" ADD CONSTRAINT "track_details_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_genres" ADD CONSTRAINT "series_genres_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_genres" ADD CONSTRAINT "series_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item_categories" ADD CONSTRAINT "media_item_categories_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item_categories" ADD CONSTRAINT "media_item_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torrents" ADD CONSTRAINT "torrents_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_status_history" ADD CONSTRAINT "download_status_history_torrent_id_fkey" FOREIGN KEY ("torrent_id") REFERENCES "torrents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcode_jobs" ADD CONSTRAINT "transcode_jobs_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcode_status_history" ADD CONSTRAINT "transcode_status_history_transcode_job_id_fkey" FOREIGN KEY ("transcode_job_id") REFERENCES "transcode_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
