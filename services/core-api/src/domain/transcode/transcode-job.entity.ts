export type TranscodeStatus =
  | 'queued'
  | 'transcoding'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TranscodeJob {
  id: string;
  mediaItemId: string;
  sourcePath: string;
  outputPath: string | null;
  status: TranscodeStatus;
  sizeBeforeBytes: bigint | null;
  sizeAfterBytes: bigint | null;
}

export interface CreateTranscodeJobInput {
  mediaItemId: string;
  sourcePath: string;
}

export interface TranscodedResultInput {
  outputPath: string;
  status: 'completed' | 'skipped';
  sizeBeforeBytes?: bigint;
  sizeAfterBytes?: bigint;
  videoCodec?: string;
  audioCodec?: string;
  containerFormat?: string;
}

export const TRANSCODE_JOB_REPOSITORY = Symbol('TRANSCODE_JOB_REPOSITORY');

export interface TranscodeJobRepository {
  create(input: CreateTranscodeJobInput): Promise<TranscodeJob>;
  findById(id: string): Promise<TranscodeJob | null>;
  recordStatusChange(
    transcodeJobId: string,
    status: TranscodeStatus,
    detail?: Record<string, unknown>,
  ): Promise<void>;
  recordTranscoded(transcodeJobId: string, result: TranscodedResultInput): Promise<void>;
}
