import { Inject, Injectable } from '@nestjs/common';
import {
  EpisodeMetadataInput,
  MEDIA_ITEM_REPOSITORY,
  MediaItemRepository,
  MovieMetadataInput,
  TrackMetadataInput,
} from '../../domain/media/media-item-repository.port';

@Injectable()
export class ApplyMovieMetadataUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(mediaItemId: string, input: MovieMetadataInput): Promise<void> {
    await this.mediaItems.applyMovieMetadata(mediaItemId, input);
  }
}

@Injectable()
export class ApplyEpisodeMetadataUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(mediaItemId: string, input: EpisodeMetadataInput): Promise<void> {
    await this.mediaItems.applyEpisodeMetadata(mediaItemId, input);
  }
}

@Injectable()
export class ApplyTrackMetadataUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(mediaItemId: string, input: TrackMetadataInput): Promise<void> {
    await this.mediaItems.applyTrackMetadata(mediaItemId, input);
  }
}
