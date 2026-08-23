import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AckPolicy, JSONCodec, JetStreamClient, createInbox } from 'nats';
import { JETSTREAM_CLIENT, JSON_CODEC } from '../nats.tokens';
import { EVENT_SUBJECTS, MediaDownloadedEvent } from '../../../domain/events/events';
import { ProcessMediaDownloadedUseCase } from '../../../application/media/process-media-downloaded.use-case';

@Injectable()
export class MediaDownloadedSubscriber implements OnModuleInit {
  constructor(
    @Inject(JETSTREAM_CLIENT) private readonly js: JetStreamClient,
    @Inject(JSON_CODEC) private readonly jsonCodec: ReturnType<typeof JSONCodec>,
    private readonly processMediaDownloaded: ProcessMediaDownloadedUseCase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MediaDownloadedSubscriber.name);
  }

  async onModuleInit(): Promise<void> {
    const sub = await this.js.subscribe(EVENT_SUBJECTS.MEDIA_DOWNLOADED, {
      config: {
        durable_name: 'core-api-media-downloaded',
        ack_policy: AckPolicy.Explicit,
        deliver_subject: createInbox(),
      },
    });

    void this.consume(sub);
  }

  private async consume(sub: Awaited<ReturnType<JetStreamClient['subscribe']>>): Promise<void> {
    for await (const msg of sub) {
      try {
        const event = this.jsonCodec.decode(msg.data) as MediaDownloadedEvent;
        this.logger.info({ torrentHash: event.torrentHash }, 'processing media.downloaded');
        await this.processMediaDownloaded.execute(event);
        msg.ack();
      } catch (err) {
        this.logger.error({ err }, 'failed to process media.downloaded — will redeliver');
        msg.nak();
      }
    }
  }
}
