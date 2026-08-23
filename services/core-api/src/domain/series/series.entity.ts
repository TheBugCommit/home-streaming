export interface Series {
  id: string;
  tmdbId: number | null;
  title: string;
  overview: string | null;
  firstAirDate: Date | null;
  posterPath: string | null;
  backdropPath: string | null;
  status: 'ongoing' | 'ended' | null;
}

export interface Season {
  id: string;
  seriesId: string;
  seasonNumber: number;
}

export interface UpsertSeriesInput {
  tmdbId: number;
  title: string;
  overview?: string;
  firstAirDate?: Date;
  posterPath?: string;
  backdropPath?: string;
  status?: 'ongoing' | 'ended';
  genreNames?: string[];
  seasonNumber: number;
  seasonTmdbId?: number;
  seasonOverview?: string;
  seasonPosterPath?: string;
}

export interface UpsertSeriesResult {
  series: Series;
  season: Season;
}

export const SERIES_REPOSITORY = Symbol('SERIES_REPOSITORY');

export interface SeriesRepository {
  findAll(): Promise<Series[]>;
  findById(id: string): Promise<Series | null>;
  upsertByTmdbId(input: UpsertSeriesInput): Promise<UpsertSeriesResult>;
}
