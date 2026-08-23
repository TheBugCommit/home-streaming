import { Inject, Injectable, Logger } from '@nestjs/common';
import { MediaType } from '../../domain/media/media-item.entity';
import {
  MEDIA_ITEM_REPOSITORY,
  MediaItemRepository,
} from '../../domain/media/media-item-repository.port';
import {
  TORRENT_REPOSITORY,
  TorrentRepository,
} from '../../domain/torrents/torrent.entity';
import {
  TRANSCODE_JOB_REPOSITORY,
  TranscodeJobRepository,
} from '../../domain/transcode/transcode-job.entity';
import {
  EVENT_PUBLISHER,
  EVENT_SUBJECTS,
  EventPublisher,
  MediaDownloadedEvent,
  MediaTranscodePendingEvent,
} from '../../domain/events/events';

const CATEGORY_TO_MEDIA_TYPE: Record<MediaDownloadedEvent['category'], MediaType> = {
  movies: 'movie',
  tv: 'episode',
  music: 'track',
};

function titleFromFilename(relativePath: string): string {
  const base = relativePath.split('/').pop() ?? relativePath;
  const withoutExt = base.replace(/\.[^./]+$/, '');
  return withoutExt.replace(/[._]+/g, ' ').trim();
}

@Injectable()
export class ProcessMediaDownloadedUseCase {
  private readonly logger = new Logger(ProcessMediaDownloadedUseCase.name);

  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
    @Inject(TORRENT_REPOSITORY) private readonly torrents: TorrentRepository,
    @Inject(TRANSCODE_JOB_REPOSITORY) private readonly transcodeJobs: TranscodeJobRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute(event: MediaDownloadedEvent): Promise<void> {
    let sourceTorrentId: string | undefined;

    if (event.requestId) {
      const torrent = await this.torrents.findById(event.requestId);
      if (torrent) {
        sourceTorrentId = torrent.id;
        if (!torrent.qbittorrentHash) {
          await this.torrents.setHash(torrent.id, event.torrentHash);
        }
        await this.torrents.updateStatus(torrent.id, 'completed', {
          torrentHash: event.torrentHash,
          fileCount: event.files.length,
        });
      } else {
        this.logger.warn(
          `media.downloaded requestId=${event.requestId} does not match any known torrent — proceeding without a source_torrent_id link`,
        );
      }
    } else {
      this.logger.warn(
        `media.downloaded for hash=${event.torrentHash} arrived without a requestId (torrent added outside our own flow) — proceeding without a source_torrent_id link`,
      );
    }

    const mediaType = CATEGORY_TO_MEDIA_TYPE[event.category];

    for (const file of event.files) {
      const mediaItem = await this.mediaItems.create({
        type: mediaType,
        title: titleFromFilename(file.relativePath),
        filePath: file.absolutePath,
        fileSizeBytes: BigInt(file.sizeBytes),
        sourceTorrentId,
      });

      const transcodeJob = await this.transcodeJobs.create({
        mediaItemId: mediaItem.id,
        sourcePath: file.absolutePath,
      });

      const payload: MediaTranscodePendingEvent = {
        transcodeJobId: transcodeJob.id,
        mediaItemId: mediaItem.id,
        contentType: mediaType,
        sourcePath: file.absolutePath,
      };
      await this.events.publish(EVENT_SUBJECTS.MEDIA_TRANSCODE_PENDING, payload);
    }
  }
}
