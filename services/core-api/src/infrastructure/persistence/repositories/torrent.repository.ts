import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTorrentInput,
  Torrent,
  TorrentRepository,
  TorrentStatus,
} from '../../../domain/torrents/torrent.entity';

@Injectable()
export class PrismaTorrentRepository implements TorrentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTorrentInput): Promise<Torrent> {
    return this.prisma.torrent.create({
      data: {
        contentType: input.contentType,
        categoryLabel: input.categoryLabel,
        originalTorrentFilename: input.originalTorrentFilename,
        savePath: input.savePath,
        submittedByUserId: input.submittedByUserId,
      },
    });
  }

  async findById(id: string): Promise<Torrent | null> {
    return this.prisma.torrent.findUnique({ where: { id } });
  }

  async findByHash(hash: string): Promise<Torrent | null> {
    return this.prisma.torrent.findUnique({ where: { qbittorrentHash: hash } });
  }

  async findAll(): Promise<Torrent[]> {
    return this.prisma.torrent.findMany({ orderBy: { addedAt: 'desc' } });
  }

  async updateStatus(
    id: string,
    status: TorrentStatus,
    detail?: Record<string, unknown>,
  ): Promise<Torrent> {
    const torrent = await this.prisma.torrent.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : undefined,
      },
    });
    await this.prisma.downloadStatusHistory.create({
      data: { torrentId: id, status, detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    return torrent;
  }

  async setHash(id: string, hash: string): Promise<Torrent> {
    return this.prisma.torrent.update({
      where: { id },
      data: { qbittorrentHash: hash },
    });
  }
}
