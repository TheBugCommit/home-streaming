import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListSeriesUseCase, GetSeriesDetailUseCase } from '../../../application/series/list-series.use-case';
import { ReadAccessGuard } from '../guards/read-access.guard';

@ApiTags('series')
@ApiBearerAuth()
@Controller('series')
@UseGuards(ReadAccessGuard)
export class SeriesController {
  constructor(
    private readonly listSeries: ListSeriesUseCase,
    private readonly getSeriesDetail: GetSeriesDetailUseCase,
  ) {}

  @Get()
  async list() {
    return this.listSeries.execute();
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.getSeriesDetail.execute(id);
  }
}
