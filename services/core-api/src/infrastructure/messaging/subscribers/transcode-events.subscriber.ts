import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AckPolicy, JSONCodec, JetStreamClient, createInbox } from 'nats';
import { JETSTREAM_CLIENT, JSON_CODEC } from '../nats.tokens';
import {
  EVENT_SUBJECTS,
  MediaTranscodeStatusChangedEvent,
  MediaTranscodedEvent,
} from '../../../domain/events/events';
import {
  HandleMediaTranscodedUseCase,
  HandleTranscodeStatusChangedUseCase,
} from '../../../application/media/handle-transcode-events.use-case';

@Injectable()
export class TranscodeEventsSubscriber implements OnModuleInit {
  constructor(
    @Inject(JETSTREAM_CLIENT) private readonly js: JetStreamClient,
    @Inject(JSON_CODEC) private readonly jsonCodec: ReturnType<typeof JSONCodec>,
    private readonly handleStatusChanged: HandleTranscodeStatusChangedUseCase,
    private readonly handleTranscoded: HandleMediaTranscodedUseCase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TranscodeEventsSubscriber.name);
  }

  async onModuleInit(): Promise<void> {
    const statusSub = await this.js.subscribe(EVENT_SUBJECTS.MEDIA_TRANSCODE_STATUS_CHANGED, {
      config: {
        durable_name: 'core-api-transcode-status-changed',
        ack_policy: AckPolicy.Explicit,
        deliver_subject: createInbox(),
      },
    });
    void this.consumeStatusChanged(statusSub);

    const transcodedSub = await this.js.subscribe(EVENT_SUBJECTS.MEDIA_TRANSCODED, {
      config: {
        durable_name: 'core-api-media-transcoded',
        ack_policy: AckPolicy.Explicit,
        deliver_subject: createInbox(),
      },
    });
    void this.consumeTranscoded(transcodedSub);
  }

  private async consumeStatusChanged(
    sub: Awaited<ReturnType<JetStreamClient['subscribe']>>,
  ): Promise<void> {
    for await (const msg of sub) {
      try {
        const event = this.jsonCodec.decode(msg.data) as MediaTranscodeStatusChangedEvent;
        this.logger.info(
          { transcodeJobId: event.transcodeJobId, mediaItemId: event.mediaItemId, status: event.status },
          'processing media.transcode_status_changed',
        );
        await this.handleStatusChanged.execute(event);
        msg.ack();
      } catch (err) {
        this.logger.error({ err }, 'failed to process media.transcode_status_changed — will redeliver');
        msg.nak();
      }
    }
  }

  private async consumeTranscoded(
    sub: Awaited<ReturnType<JetStreamClient['subscribe']>>,
  ): Promise<void> {
    for await (const msg of sub) {
      try {
        const event = this.jsonCodec.decode(msg.data) as MediaTranscodedEvent;
        this.logger.info(
          { transcodeJobId: event.transcodeJobId, mediaItemId: event.mediaItemId },
          'processing media.transcoded',
        );
        await this.handleTranscoded.execute(event);
        msg.ack();
      } catch (err) {
        this.logger.error({ err }, 'failed to process media.transcoded — will redeliver');
        msg.nak();
      }
    }
  }
}
