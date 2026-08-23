import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { SubmitTorrentUseCase } from '../../../application/torrents/submit-torrent.use-case';
import { TORRENT_REPOSITORY, TorrentRepository } from '../../../domain/torrents/torrent.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminRolesGuard } from '../guards/roles.guard';
import { RequestWithAuth } from '../guards/auth-context';
import { UploadTorrentDto } from '../dto/torrent.dto';

@ApiTags('torrents')
@ApiBearerAuth()
@Controller('torrents')
@UseGuards(JwtAuthGuard, AdminRolesGuard)
export class TorrentsController {
  constructor(
    private readonly submitTorrent: SubmitTorrentUseCase,
    @Inject(TORRENT_REPOSITORY) private readonly torrents: TorrentRepository,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithAuth,
  ) {
    if (!file) {
      throw new BadRequestException('Missing .torrent file field "file"');
    }
    if (req.authContext?.type !== 'jwt') {
      throw new BadRequestException('Unexpected auth context');
    }

    const contentType = (req.body as { contentType?: string }).contentType;
    const dto = new UploadTorrentDto();
    dto.contentType = (contentType ?? 'movie') as UploadTorrentDto['contentType'];
    if (!['movie', 'tv', 'music'].includes(dto.contentType)) {
      throw new BadRequestException('contentType must be one of movie, tv, music');
    }

    const torrent = await this.submitTorrent.execute({
      contentType: dto.contentType,
      torrentFileBuffer: file.buffer,
      originalFilename: file.originalname,
      submittedByUserId: req.authContext.userId,
    });

    return torrent;
  }

  @Get()
  async list() {
    return this.torrents.findAll();
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const torrent = await this.torrents.findById(id);
    if (!torrent) {
      throw new NotFoundException(`Torrent ${id} not found`);
    }
    return torrent;
  }
}
