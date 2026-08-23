import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';

import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { NatsClientModule } from './infrastructure/messaging/nats-client.module';
import { MediaDownloadedSubscriber } from './infrastructure/messaging/subscribers/media-downloaded.subscriber';
import { TranscodeEventsSubscriber } from './infrastructure/messaging/subscribers/transcode-events.subscriber';

import { HealthController } from './infrastructure/http/controllers/health.controller';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { MediaController } from './infrastructure/http/controllers/media.controller';
import { SeriesController } from './infrastructure/http/controllers/series.controller';
import { GenresController } from './infrastructure/http/controllers/genres.controller';
import { CategoriesController } from './infrastructure/http/controllers/categories.controller';
import { TorrentsController } from './infrastructure/http/controllers/torrents.controller';
import { ApiKeysController } from './infrastructure/http/controllers/api-keys.controller';
import { InternalController } from './infrastructure/http/controllers/internal.controller';

import { ListMediaUseCase } from './application/media/list-media.use-case';
import { GetMediaDetailUseCase } from './application/media/get-media-detail.use-case';
import { DeleteMediaUseCase, UpdateMediaUseCase } from './application/media/update-media.use-case';
import { ProcessMediaDownloadedUseCase } from './application/media/process-media-downloaded.use-case';
import {
  ApplyEpisodeMetadataUseCase,
  ApplyMovieMetadataUseCase,
  ApplyTrackMetadataUseCase,
} from './application/media/apply-metadata.use-case';
import {
  HandleMediaTranscodedUseCase,
  HandleTranscodeStatusChangedUseCase,
} from './application/media/handle-transcode-events.use-case';

import { SubmitTorrentUseCase } from './application/torrents/submit-torrent.use-case';

import {
  AuthenticateUserUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
} from './application/users/authenticate-user.use-case';
import { BootstrapAdminUseCase } from './application/users/bootstrap-admin.use-case';

import {
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
} from './application/api-keys/manage-api-keys.use-case';

import {
  CreateCategoryUseCase,
  DeleteCategoryUseCase,
  ListCategoriesUseCase,
  ListGenresUseCase,
  UpdateCategoryUseCase,
} from './application/categories/manage-category.use-case';

import { UpsertSeriesUseCase } from './application/series/upsert-series.use-case';
import {
  GetSeriesDetailUseCase,
  ListSeriesUseCase,
} from './application/series/list-series.use-case';

import { JwtAuthGuard } from './infrastructure/http/guards/jwt-auth.guard';
import { ReadAccessGuard } from './infrastructure/http/guards/read-access.guard';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        formatters: {
          level: (label) => ({ level: label }),
        },
        base: { service: 'core-api' },
        // These logs ship to Loki (docker-compose.yml's loki logging driver), which anyone with
        // Grafana access can query — never let a live bearer token, API key, or cookie land there.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-internal-api-key"]',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
      },
    }),
    JwtModule.register({}),
    PersistenceModule,
    NatsClientModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    MediaController,
    SeriesController,
    GenresController,
    CategoriesController,
    TorrentsController,
    ApiKeysController,
    InternalController,
  ],
  providers: [
    // media
    ListMediaUseCase,
    GetMediaDetailUseCase,
    UpdateMediaUseCase,
    DeleteMediaUseCase,
    ProcessMediaDownloadedUseCase,
    ApplyMovieMetadataUseCase,
    ApplyEpisodeMetadataUseCase,
    ApplyTrackMetadataUseCase,
    HandleTranscodeStatusChangedUseCase,
    HandleMediaTranscodedUseCase,
    // torrents
    SubmitTorrentUseCase,
    // users / auth
    AuthenticateUserUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    BootstrapAdminUseCase,
    // api keys
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    // categories / genres
    ListGenresUseCase,
    ListCategoriesUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
    // series
    UpsertSeriesUseCase,
    ListSeriesUseCase,
    GetSeriesDetailUseCase,
    // guards (injectable, constructed per-request via UseGuards but also usable standalone)
    JwtAuthGuard,
    ReadAccessGuard,
    // messaging subscribers
    MediaDownloadedSubscriber,
    TranscodeEventsSubscriber,
  ],
})
export class AppModule {}
