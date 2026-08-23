import { Inject, Injectable } from '@nestjs/common';
import { JSONCodec, JetStreamClient } from 'nats';
import { EventPublisher } from '../../../domain/events/events';
import { JETSTREAM_CLIENT, JSON_CODEC } from '../nats.tokens';

@Injectable()
export class NatsEventPublisher implements EventPublisher {
  constructor(
    @Inject(JETSTREAM_CLIENT) private readonly js: JetStreamClient,
    @Inject(JSON_CODEC) private readonly jsonCodec: ReturnType<typeof JSONCodec>,
  ) {}

  async publish(subject: string, payload: unknown): Promise<void> {
    await this.js.publish(subject, this.jsonCodec.encode(payload));
  }
}
