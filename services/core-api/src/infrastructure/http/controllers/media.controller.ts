import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListMediaUseCase } from '../../../application/media/list-media.use-case';
import { GetMediaDetailUseCase } from '../../../application/media/get-media-detail.use-case';
import {
  DeleteMediaUseCase,
  UpdateMediaUseCase,
} from '../../../application/media/update-media.use-case';
import { ReadAccessGuard } from '../guards/read-access.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminRolesGuard } from '../guards/roles.guard';
import { ListMediaQueryDto, UpdateMediaDto } from '../dto/media.dto';
import { MediaItem, MediaStatus } from '../../../domain/media/media-item.entity';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(
    private readonly listMedia: ListMediaUseCase,
    private readonly getMediaDetail: GetMediaDetailUseCase,
    private readonly updateMedia: UpdateMediaUseCase,
    private readonly deleteMedia: DeleteMediaUseCase,
  ) {}

  @Get()
  @UseGuards(ReadAccessGuard)
  async list(@Query() query: ListMediaQueryDto) {
    const result = await this.listMedia.execute({
      type: query.type,
      status: query.status as MediaStatus | undefined,
      genreId: query.genreId,
      categoryId: query.categoryId,
      seriesId: query.seriesId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      ...result,
      items: result.items.map(serializeMediaItem),
    };
  }

  @Get(':id')
  @UseGuards(ReadAccessGuard)
  async detail(@Param('id') id: string) {
    return serializeMediaItem(await this.getMediaDetail.execute(id));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  async patch(@Param('id') id: string, @Body() dto: UpdateMediaDto) {
    return serializeMediaItem(await this.updateMedia.execute(id, dto));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  async remove(@Param('id') id: string) {
    await this.deleteMedia.execute(id);
    return { status: 'ok' };
  }
}

// BigInt fields don't serialize via JSON.stringify by default — surface them as strings.
function serializeMediaItem(item: MediaItem) {
  return {
    ...item,
    fileSizeBytes: item.fileSizeBytes !== null ? String(item.fileSizeBytes) : null,
  };
}
