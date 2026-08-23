import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { connect, JSONCodec, JetStreamClient, NatsConnection } from 'nats';
import { loadConfig } from '../../config/configuration';
import { EVENT_PUBLISHER } from '../../domain/events/events';
import { NatsEventPublisher } from './publishers/nats-event.publisher';
import {
  JETSTREAM_CLIENT,
  JSON_CODEC,
  NATS_CONNECTION,
  STREAM_NAME,
  STREAM_SUBJECTS,
} from './nats.tokens';

@Global()
@Module({
  providers: [
    {
      provide: NATS_CONNECTION,
      useFactory: async (): Promise<NatsConnection> => {
        const config = loadConfig();
        return connect({ servers: config.natsUrl });
      },
    },
    {
      provide: JETSTREAM_CLIENT,
      useFactory: async (nc: NatsConnection): Promise<JetStreamClient> => {
        const jsm = await nc.jetstreamManager();
        try {
          await jsm.streams.add({ name: STREAM_NAME, subjects: STREAM_SUBJECTS });
        } catch {
          // stream already exists — idempotent bootstrap, safe to ignore
        }
        return nc.jetstream();
      },
      inject: [NATS_CONNECTION],
    },
    {
      provide: JSON_CODEC,
      useFactory: () => JSONCodec(),
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: NatsEventPublisher,
    },
  ],
  exports: [NATS_CONNECTION, JETSTREAM_CLIENT, JSON_CODEC, EVENT_PUBLISHER],
})
export class NatsClientModule implements OnModuleInit {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(NatsClientModule.name);
  }

  onModuleInit() {
    this.logger.info('NATS client module initialized');
  }
}
