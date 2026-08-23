import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SERIES_REPOSITORY,
  Series,
  SeriesRepository,
} from '../../domain/series/series.entity';

@Injectable()
export class ListSeriesUseCase {
  constructor(@Inject(SERIES_REPOSITORY) private readonly series: SeriesRepository) {}

  async execute(): Promise<Series[]> {
    return this.series.findAll();
  }
}

@Injectable()
export class GetSeriesDetailUseCase {
  constructor(@Inject(SERIES_REPOSITORY) private readonly series: SeriesRepository) {}

  async execute(id: string): Promise<Series> {
    const found = await this.series.findById(id);
    if (!found) {
      throw new NotFoundException(`Series ${id} not found`);
    }
    return found;
  }
}
