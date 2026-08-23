import { Global, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MEDIA_ITEM_REPOSITORY } from '../../domain/media/media-item-repository.port';
import { TORRENT_REPOSITORY } from '../../domain/torrents/torrent.entity';
import { TRANSCODE_JOB_REPOSITORY } from '../../domain/transcode/transcode-job.entity';
import { USER_REPOSITORY } from '../../domain/users/user.entity';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/auth/refresh-token.entity';
import { API_KEY_REPOSITORY } from '../../domain/auth/api-key.entity';
import { SERIES_REPOSITORY } from '../../domain/series/series.entity';
import { CATEGORY_REPOSITORY, GENRE_REPOSITORY } from '../../domain/categories/category.entity';

import { PrismaMediaItemRepository } from './repositories/media-item.repository';
import { PrismaTorrentRepository } from './repositories/torrent.repository';
import { PrismaTranscodeJobRepository } from './repositories/transcode-job.repository';
import { PrismaUserRepository } from './repositories/user.repository';
import { PrismaRefreshTokenRepository } from './repositories/refresh-token.repository';
import { PrismaApiKeyRepository } from './repositories/api-key.repository';
import { PrismaSeriesRepository } from './repositories/series.repository';
import {
  PrismaCategoryRepository,
  PrismaGenreRepository,
} from './repositories/genre-category.repository';

const REPOSITORY_PROVIDERS = [
  { provide: MEDIA_ITEM_REPOSITORY, useClass: PrismaMediaItemRepository },
  { provide: TORRENT_REPOSITORY, useClass: PrismaTorrentRepository },
  { provide: TRANSCODE_JOB_REPOSITORY, useClass: PrismaTranscodeJobRepository },
  { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
  { provide: API_KEY_REPOSITORY, useClass: PrismaApiKeyRepository },
  { provide: SERIES_REPOSITORY, useClass: PrismaSeriesRepository },
  { provide: GENRE_REPOSITORY, useClass: PrismaGenreRepository },
  { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
];

@Global()
@Module({
  imports: [PrismaModule],
  providers: [...REPOSITORY_PROVIDERS],
  exports: [...REPOSITORY_PROVIDERS.map((p) => p.provide)],
})
export class PersistenceModule {}
