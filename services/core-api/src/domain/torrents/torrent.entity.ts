export type ContentType = 'movie' | 'tv' | 'music';
export type TorrentStatus = 'queued' | 'downloading' | 'completed' | 'error';

export interface Torrent {
  id: string;
  contentType: ContentType;
  categoryLabel: string;
  qbittorrentHash: string | null;
  originalTorrentFilename: string;
  savePath: string;
  status: TorrentStatus;
  progressPercent: number;
  submittedByUserId: string;
  addedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

export interface CreateTorrentInput {
  contentType: ContentType;
  categoryLabel: string;
  originalTorrentFilename: string;
  savePath: string;
  submittedByUserId: string;
}

export const TORRENT_REPOSITORY = Symbol('TORRENT_REPOSITORY');

export interface TorrentRepository {
  create(input: CreateTorrentInput): Promise<Torrent>;
  findById(id: string): Promise<Torrent | null>;
  findByHash(hash: string): Promise<Torrent | null>;
  findAll(): Promise<Torrent[]>;
  updateStatus(id: string, status: TorrentStatus, detail?: Record<string, unknown>): Promise<Torrent>;
  setHash(id: string, hash: string): Promise<Torrent>;
}
