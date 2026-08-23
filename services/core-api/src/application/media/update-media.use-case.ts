import { Inject, Injectable } from '@nestjs/common';
import { MediaItem } from '../../domain/media/media-item.entity';
import {
  MEDIA_ITEM_REPOSITORY,
  MediaItemRepository,
} from '../../domain/media/media-item-repository.port';

@Injectable()
export class UpdateMediaUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(id: string, patch: Partial<MediaItem>): Promise<MediaItem> {
    return this.mediaItems.update(id, patch);
  }
}

@Injectable()
export class DeleteMediaUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(id: string): Promise<void> {
    await this.mediaItems.delete(id);
  }
}
