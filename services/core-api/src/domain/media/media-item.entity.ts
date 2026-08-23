export type MediaType = 'movie' | 'episode' | 'track';

export type MediaStatus =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'transcoding'
  | 'transcoded'
  | 'ready'
  | 'failed';

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  sortTitle: string | null;
  releaseYear: number | null;
  durationSeconds: number | null;
  filePath: string;
  fileSizeBytes: bigint | null;
  containerFormat: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  resolution: string | null;
  status: MediaStatus;
  sourceTorrentId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaItemFilter {
  type?: MediaType;
  status?: MediaStatus;
  genreId?: string;
  categoryId?: string;
  seriesId?: string;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
