import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTranscodeJobInput,
  TranscodeJob,
  TranscodeJobRepository,
  TranscodeStatus,
  TranscodedResultInput,
} from '../../../domain/transcode/transcode-job.entity';

@Injectable()
export class PrismaTranscodeJobRepository implements TranscodeJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTranscodeJobInput): Promise<TranscodeJob> {
    return this.prisma.transcodeJob.create({
      data: {
        mediaItemId: input.mediaItemId,
        sourcePath: input.sourcePath,
      },
    });
  }

  async findById(id: string): Promise<TranscodeJob | null> {
    return this.prisma.transcodeJob.findUnique({ where: { id } });
  }

  async recordStatusChange(
    transcodeJobId: string,
    status: TranscodeStatus,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.transcodeJob.update({
        where: { id: transcodeJobId },
        data: {
          status,
          startedAt: status === 'transcoding' ? new Date() : undefined,
        },
      }),
      this.prisma.transcodeStatusHistory.create({
        data: {
          transcodeJobId,
          status,
          detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
    ]);

    const job = await this.prisma.transcodeJob.findUnique({ where: { id: transcodeJobId } });
    if (job) {
      const mediaStatus = status === 'transcoding' ? 'transcoding' : undefined;
      if (mediaStatus) {
        await this.prisma.mediaItem.update({
          where: { id: job.mediaItemId },
          data: { status: mediaStatus },
        });
      }
    }
  }

  async recordTranscoded(transcodeJobId: string, result: TranscodedResultInput): Promise<void> {
    const job = await this.prisma.transcodeJob.update({
      where: { id: transcodeJobId },
      data: {
        status: result.status,
        outputPath: result.outputPath,
        completedAt: new Date(),
        sizeBeforeBytes: result.sizeBeforeBytes,
        sizeAfterBytes: result.sizeAfterBytes,
        videoCodecAfter: result.videoCodec,
      },
    });

    await this.prisma.mediaItem.update({
      where: { id: job.mediaItemId },
      data: {
        status: 'transcoded',
        filePath: result.outputPath,
        fileSizeBytes: result.sizeAfterBytes,
        videoCodec: result.videoCodec,
        audioCodec: result.audioCodec,
        containerFormat: result.containerFormat,
      },
    });
  }
}
