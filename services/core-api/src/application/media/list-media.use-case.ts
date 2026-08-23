import { Inject, Injectable } from '@nestjs/common';
import {
  MediaItemFilter,
  Paginated,
  MediaItem,
} from '../../domain/media/media-item.entity';
import {
  MEDIA_ITEM_REPOSITORY,
  MediaItemRepository,
} from '../../domain/media/media-item-repository.port';

@Injectable()
export class ListMediaUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(filter: MediaItemFilter): Promise<Paginated<MediaItem>> {
    return this.mediaItems.findMany(filter);
  }
}
