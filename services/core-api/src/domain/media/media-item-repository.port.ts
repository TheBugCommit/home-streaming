import {
  MediaItem,
  MediaItemFilter,
  MediaType,
  Paginated,
} from './media-item.entity';

export interface CreateMediaItemInput {
  type: MediaType;
  title: string;
  filePath: string;
  fileSizeBytes?: bigint;
  sourceTorrentId?: string;
}

export interface MovieMetadataInput {
  tmdbId?: number;
  imdbId?: string;
  overview?: string;
  runtimeMinutes?: number;
  originalLanguage?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseYear?: number;
  genreNames?: string[];
}

export interface EpisodeMetadataInput {
  seriesId: string;
  seasonId: string;
  episodeNumber?: number;
  imdbId?: string;
  overview?: string;
  airDate?: Date;
  episodeTitle?: string;
  newFilePath?: string;
}

export interface TrackMetadataInput {
  musicbrainzRecordingId?: string;
  musicbrainzReleaseId?: string;
  artistName?: string;
  albumName?: string;
  trackNumber?: number;
  discNumber?: number;
  coverArtUrl?: string;
}

export const MEDIA_ITEM_REPOSITORY = Symbol('MEDIA_ITEM_REPOSITORY');

export interface MediaItemRepository {
  create(input: CreateMediaItemInput): Promise<MediaItem>;
  findById(id: string): Promise<MediaItem | null>;
  findMany(filter: MediaItemFilter): Promise<Paginated<MediaItem>>;
  update(id: string, patch: Partial<MediaItem>): Promise<MediaItem>;
  delete(id: string): Promise<void>;
  applyMovieMetadata(mediaItemId: string, input: MovieMetadataInput): Promise<void>;
  applyEpisodeMetadata(mediaItemId: string, input: EpisodeMetadataInput): Promise<void>;
  applyTrackMetadata(mediaItemId: string, input: TrackMetadataInput): Promise<void>;
}
