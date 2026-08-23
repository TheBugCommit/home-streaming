import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { GetMediaDetailUseCase } from '../../../application/media/get-media-detail.use-case';
import {
  ApplyEpisodeMetadataUseCase,
  ApplyMovieMetadataUseCase,
  ApplyTrackMetadataUseCase,
} from '../../../application/media/apply-metadata.use-case';
import { UpsertSeriesUseCase } from '../../../application/series/upsert-series.use-case';
import { InternalKeyGuard } from '../guards/internal-key.guard';
import { ApplyMetadataDto, UpsertSeriesDto } from '../dto/internal.dto';

// Never publish a host port for this controller's routes — see shared/events/README.md.
// Used exclusively by metadata-service (and, for GET, potentially other internal workers later).
@ApiExcludeController()
@Controller('internal')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(
    private readonly getMediaDetail: GetMediaDetailUseCase,
    private readonly applyMovieMetadata: ApplyMovieMetadataUseCase,
    private readonly applyEpisodeMetadata: ApplyEpisodeMetadataUseCase,
    private readonly applyTrackMetadata: ApplyTrackMetadataUseCase,
    private readonly upsertSeries: UpsertSeriesUseCase,
  ) {}

  @Get('media-items/:id')
  async getMediaItem(@Param('id') id: string) {
    return this.getMediaDetail.execute(id);
  }

  @Post('media-items/:id/metadata')
  async applyMetadata(@Param('id') id: string, @Body() dto: ApplyMetadataDto) {
    if (dto.mediaType === 'movie') {
      await this.applyMovieMetadata.execute(id, {
        tmdbId: dto.tmdbId,
        imdbId: dto.imdbId,
        overview: dto.overview,
        runtimeMinutes: dto.runtimeMinutes,
        originalLanguage: dto.originalLanguage,
        posterPath: dto.posterPath,
        backdropPath: dto.backdropPath,
        releaseYear: dto.releaseYear,
        genreNames: dto.genreNames,
      });
    } else if (dto.mediaType === 'episode') {
      if (!dto.seriesId || !dto.seasonId) {
        throw new Error('seriesId and seasonId are required for episode metadata');
      }
      await this.applyEpisodeMetadata.execute(id, {
        seriesId: dto.seriesId,
        seasonId: dto.seasonId,
        episodeNumber: dto.episodeNumber,
        imdbId: dto.imdbId,
        overview: dto.overview,
        airDate: dto.airDate ? new Date(dto.airDate) : undefined,
        episodeTitle: dto.episodeTitle,
        newFilePath: dto.newFilePath,
      });
    } else {
      await this.applyTrackMetadata.execute(id, {
        musicbrainzRecordingId: dto.musicbrainzRecordingId,
        musicbrainzReleaseId: dto.musicbrainzReleaseId,
        artistName: dto.artistName,
        albumName: dto.albumName,
        trackNumber: dto.trackNumber,
        discNumber: dto.discNumber,
        coverArtUrl: dto.coverArtUrl,
      });
    }
    return { status: 'ok' };
  }

  @Post('series/upsert')
  async seriesUpsert(@Body() dto: UpsertSeriesDto) {
    return this.upsertSeries.execute({
      tmdbId: dto.tmdbId,
      title: dto.title,
      overview: dto.overview,
      firstAirDate: dto.firstAirDate ? new Date(dto.firstAirDate) : undefined,
      posterPath: dto.posterPath,
      backdropPath: dto.backdropPath,
      status: dto.status,
      genreNames: dto.genreNames,
      seasonNumber: dto.seasonNumber,
      seasonTmdbId: dto.seasonTmdbId,
      seasonOverview: dto.seasonOverview,
      seasonPosterPath: dto.seasonPosterPath,
    });
  }
}
