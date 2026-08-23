import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Series,
  SeriesRepository,
  UpsertSeriesInput,
  UpsertSeriesResult,
} from '../../../domain/series/series.entity';

@Injectable()
export class PrismaSeriesRepository implements SeriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Series[]> {
    return this.prisma.series.findMany({ orderBy: { title: 'asc' } });
  }

  async findById(id: string): Promise<Series | null> {
    return this.prisma.series.findUnique({ where: { id } });
  }

  async upsertByTmdbId(input: UpsertSeriesInput): Promise<UpsertSeriesResult> {
    const series = await this.prisma.series.upsert({
      where: { tmdbId: input.tmdbId },
      create: {
        tmdbId: input.tmdbId,
        title: input.title,
        overview: input.overview,
        firstAirDate: input.firstAirDate,
        posterPath: input.posterPath,
        backdropPath: input.backdropPath,
        status: input.status,
      },
      update: {
        title: input.title,
        overview: input.overview,
        firstAirDate: input.firstAirDate,
        posterPath: input.posterPath,
        backdropPath: input.backdropPath,
        status: input.status,
      },
    });

    if (input.genreNames?.length) {
      for (const name of input.genreNames) {
        const genre = await this.prisma.genre.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        await this.prisma.seriesGenre.upsert({
          where: { seriesId_genreId: { seriesId: series.id, genreId: genre.id } },
          create: { seriesId: series.id, genreId: genre.id },
          update: {},
        });
      }
    }

    const season = await this.prisma.season.upsert({
      where: {
        seriesId_seasonNumber: {
          seriesId: series.id,
          seasonNumber: input.seasonNumber,
        },
      },
      create: {
        seriesId: series.id,
        seasonNumber: input.seasonNumber,
        tmdbId: input.seasonTmdbId,
        overview: input.seasonOverview,
        posterPath: input.seasonPosterPath,
      },
      update: {
        tmdbId: input.seasonTmdbId,
        overview: input.seasonOverview,
        posterPath: input.seasonPosterPath,
      },
    });

    return { series, season };
  }
}
