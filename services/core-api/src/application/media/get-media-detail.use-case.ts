import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MediaItem } from '../../domain/media/media-item.entity';
import {
  MEDIA_ITEM_REPOSITORY,
  MediaItemRepository,
} from '../../domain/media/media-item-repository.port';

@Injectable()
export class GetMediaDetailUseCase {
  constructor(
    @Inject(MEDIA_ITEM_REPOSITORY) private readonly mediaItems: MediaItemRepository,
  ) {}

  async execute(id: string): Promise<MediaItem> {
    const item = await this.mediaItems.findById(id);
    if (!item) {
      throw new NotFoundException(`Media item ${id} not found`);
    }
    return item;
  }
}
