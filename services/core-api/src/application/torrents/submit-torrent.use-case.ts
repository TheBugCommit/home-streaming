import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  ContentType,
  TORRENT_REPOSITORY,
  Torrent,
  TorrentRepository,
} from '../../domain/torrents/torrent.entity';
import {
  EVENT_PUBLISHER,
  EVENT_SUBJECTS,
  EventPublisher,
  TorrentEnqueueEvent,
} from '../../domain/events/events';

const CONTENT_TYPE_TO_CATEGORY: Record<ContentType, 'movies' | 'tv' | 'music'> = {
  movie: 'movies',
  tv: 'tv',
  music: 'music',
};

const CATEGORY_SAVE_PATH: Record<'movies' | 'tv' | 'music', string> = {
  movies: '/data/library/movies',
  tv: '/data/library/tv',
  music: '/data/library/music',
};

export interface SubmitTorrentInput {
  contentType: ContentType;
  torrentFileBuffer: Buffer;
  originalFilename: string;
  submittedByUserId: string;
}

@Injectable()
export class SubmitTorrentUseCase {
  constructor(
    @Inject(TORRENT_REPOSITORY) private readonly torrents: TorrentRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SubmitTorrentUseCase.name);
  }

  async execute(input: SubmitTorrentInput): Promise<Torrent> {
    const category = CONTENT_TYPE_TO_CATEGORY[input.contentType];

    // The torrent's own id doubles as the event's requestId, so torrent-worker's completion
    // callback (which echoes requestId back) lets us correlate without an extra lookup table.
    const torrent = await this.torrents.create({
      contentType: input.contentType,
      categoryLabel: category,
      originalTorrentFilename: input.originalFilename,
      savePath: CATEGORY_SAVE_PATH[category],
      submittedByUserId: input.submittedByUserId,
    });

    // Reconcile the generated id with the requestId contract: since Prisma generates the id at
    // create time, use the created torrent's own id as requestId going forward.
    const payload: TorrentEnqueueEvent = {
      requestId: torrent.id,
      contentType: input.contentType,
      category,
      torrentFileBase64: input.torrentFileBuffer.toString('base64'),
      submittedByUserId: input.submittedByUserId,
      submittedAt: new Date().toISOString(),
    };

    await this.events.publish(EVENT_SUBJECTS.TORRENT_ENQUEUE, payload);

    this.logger.info(
      { torrentId: torrent.id, requestId: payload.requestId, category, contentType: input.contentType },
      'torrent submitted, published torrent.enqueue',
    );

    return torrent;
  }
}
