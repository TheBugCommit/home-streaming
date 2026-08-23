// Mirrors shared/events/schemas/*.json — treat that directory as the source of truth for the
// wire contract; this file is the TypeScript-side view of it.

export interface TorrentEnqueueEvent {
  requestId: string;
  contentType: 'movie' | 'tv' | 'music';
  category: 'movies' | 'tv' | 'music';
  torrentFileBase64: string;
  submittedByUserId: string;
  submittedAt: string;
}

export interface MediaDownloadedFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  fileExtension: string;
}

export interface MediaDownloadedEvent {
  torrentHash: string;
  requestId: string | null;
  contentType: 'movie' | 'tv' | 'music';
  category: 'movies' | 'tv' | 'music';
  completedAt: string;
  files: MediaDownloadedFile[];
}

export interface MediaTranscodePendingEvent {
  transcodeJobId: string;
  mediaItemId: string;
  contentType: 'movie' | 'episode' | 'track';
  sourcePath: string;
}

export interface MediaTranscodeStatusChangedEvent {
  transcodeJobId: string;
  mediaItemId: string;
  status: 'queued' | 'transcoding' | 'completed' | 'failed' | 'skipped';
  detail?: Record<string, unknown>;
  occurredAt: string;
}

export interface MediaTranscodedEvent {
  mediaItemId: string;
  transcodeJobId: string;
  contentType: 'movie' | 'episode' | 'track';
  outputPath: string;
  status: 'completed' | 'skipped';
  sizeBeforeBytes?: number;
  sizeAfterBytes?: number;
  videoCodec?: string | null;
  audioCodec?: string | null;
  containerFormat?: string | null;
  occurredAt: string;
}

export const EVENT_SUBJECTS = {
  TORRENT_ENQUEUE: 'torrent.enqueue',
  MEDIA_DOWNLOADED: 'media.downloaded',
  MEDIA_TRANSCODE_PENDING: 'media.transcode_pending',
  MEDIA_TRANSCODE_STATUS_CHANGED: 'media.transcode_status_changed',
  MEDIA_TRANSCODED: 'media.transcoded',
} as const;

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface EventPublisher {
  publish(subject: string, payload: unknown): Promise<void>;
}
