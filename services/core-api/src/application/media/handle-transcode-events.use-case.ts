import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSCODE_JOB_REPOSITORY,
  TranscodeJobRepository,
} from '../../domain/transcode/transcode-job.entity';
import {
  MediaTranscodeStatusChangedEvent,
  MediaTranscodedEvent,
} from '../../domain/events/events';

@Injectable()
export class HandleTranscodeStatusChangedUseCase {
  constructor(
    @Inject(TRANSCODE_JOB_REPOSITORY) private readonly transcodeJobs: TranscodeJobRepository,
  ) {}

  async execute(event: MediaTranscodeStatusChangedEvent): Promise<void> {
    await this.transcodeJobs.recordStatusChange(event.transcodeJobId, event.status, event.detail);
  }
}

@Injectable()
export class HandleMediaTranscodedUseCase {
  constructor(
    @Inject(TRANSCODE_JOB_REPOSITORY) private readonly transcodeJobs: TranscodeJobRepository,
  ) {}

  async execute(event: MediaTranscodedEvent): Promise<void> {
    await this.transcodeJobs.recordTranscoded(event.transcodeJobId, {
      outputPath: event.outputPath,
      status: event.status,
      sizeBeforeBytes: event.sizeBeforeBytes !== undefined ? BigInt(event.sizeBeforeBytes) : undefined,
      sizeAfterBytes: event.sizeAfterBytes !== undefined ? BigInt(event.sizeAfterBytes) : undefined,
      videoCodec: event.videoCodec ?? undefined,
      audioCodec: event.audioCodec ?? undefined,
      containerFormat: event.containerFormat ?? undefined,
    });
  }
}
