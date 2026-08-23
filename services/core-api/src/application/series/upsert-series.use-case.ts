import { Inject, Injectable } from '@nestjs/common';
import {
  SERIES_REPOSITORY,
  SeriesRepository,
  UpsertSeriesInput,
  UpsertSeriesResult,
} from '../../domain/series/series.entity';

@Injectable()
export class UpsertSeriesUseCase {
  constructor(
    @Inject(SERIES_REPOSITORY) private readonly series: SeriesRepository,
  ) {}

  async execute(input: UpsertSeriesInput): Promise<UpsertSeriesResult> {
    return this.series.upsertByTmdbId(input);
  }
}
