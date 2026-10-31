create type public."MediaStatus" as enum ('pending', 'downloading', 'downloaded', 'transcoding', 'transcoded', 'ready', 'failed');
alter type public."MediaStatus" owner to homestream;

create type public."ContentType" as enum ('movie', 'tv', 'music');
alter type public."ContentType" owner to homestream;

create type public."MediaType" as enum ('movie', 'episode', 'track');
alter type public."MediaType" owner to homestream;

create type public."MetadataProvider" as enum ('tmdb');
alter type public."MetadataProvider" owner to homestream;

create type public."SeriesStatus" as enum ('ongoing', 'ended');
alter type public."SeriesStatus" owner to homestream;

create type public."TorrentStatus" as enum ('queued', 'downloading', 'completed', 'error');
alter type public."TorrentStatus" owner to homestream;

create type public."TranscodeStatus" as enum ('queued', 'transcoding', 'completed', 'failed', 'skipped');
alter type public."TranscodeStatus" owner to homestream;

create type public."UserRole" as enum ('admin', 'viewer');
alter type public."UserRole" owner to homestream;
