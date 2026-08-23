import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MediaItem,
  MediaItemFilter,
  Paginated,
} from '../../../domain/media/media-item.entity';
import {
  CreateMediaItemInput,
  EpisodeMetadataInput,
  MediaItemRepository,
  MovieMetadataInput,
  TrackMetadataInput,
} from '../../../domain/media/media-item-repository.port';

@Injectable()
export class PrismaMediaItemRepository implements MediaItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMediaItemInput): Promise<MediaItem> {
    return this.prisma.mediaItem.create({
      data: {
        type: input.type,
        title: input.title,
        filePath: input.filePath,
        fileSizeBytes: input.fileSizeBytes,
        sourceTorrentId: input.sourceTorrentId,
        status: 'downloaded',
      },
    });
  }

  async findById(id: string): Promise<MediaItem | null> {
    return this.prisma.mediaItem.findUnique({ where: { id } });
  }

  async findMany(filter: MediaItemFilter): Promise<Paginated<MediaItem>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 25;

    const where: Record<string, unknown> = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.genreId) where.genres = { some: { genreId: filter.genreId } };
    if (filter.categoryId) where.categories = { some: { categoryId: filter.categoryId } };
    if (filter.seriesId) where.episodeDetails = { is: { seriesId: filter.seriesId } };

    const [items, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaItem.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async update(id: string, patch: Partial<MediaItem>): Promise<MediaItem> {
    return this.prisma.mediaItem.update({
      where: { id },
      data: patch as Record<string, unknown>,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.mediaItem.delete({ where: { id } });
  }

  async applyMovieMetadata(mediaItemId: string, input: MovieMetadataInput): Promise<void> {
    await this.prisma.movieDetails.upsert({
      where: { mediaItemId },
      create: {
        mediaItemId,
        tmdbId: input.tmdbId,
        imdbId: input.imdbId,
        overview: input.overview,
        runtimeMinutes: input.runtimeMinutes,
        originalLanguage: input.originalLanguage,
        posterPath: input.posterPath,
        backdropPath: input.backdropPath,
      },
      update: {
        tmdbId: input.tmdbId,
        imdbId: input.imdbId,
        overview: input.overview,
        runtimeMinutes: input.runtimeMinutes,
        originalLanguage: input.originalLanguage,
        posterPath: input.posterPath,
        backdropPath: input.backdropPath,
      },
    });

    if (input.releaseYear) {
      await this.prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { releaseYear: input.releaseYear, status: 'ready' },
      });
    } else {
      await this.prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { status: 'ready' },
      });
    }

    if (input.genreNames?.length) {
      await this.linkGenres(mediaItemId, input.genreNames);
    }
  }

  async applyEpisodeMetadata(mediaItemId: string, input: EpisodeMetadataInput): Promise<void> {
    await this.prisma.episodeDetails.upsert({
      where: { mediaItemId },
      create: {
        mediaItemId,
        seriesId: input.seriesId,
        seasonId: input.seasonId,
        episodeNumber: input.episodeNumber,
        imdbId: input.imdbId,
        overview: input.overview,
        airDate: input.airDate,
      },
      update: {
        seriesId: input.seriesId,
        seasonId: input.seasonId,
        episodeNumber: input.episodeNumber,
        imdbId: input.imdbId,
        overview: input.overview,
        airDate: input.airDate,
      },
    });

    const data: Record<string, unknown> = { status: 'ready' };
    if (input.episodeTitle) data.title = input.episodeTitle;
    if (input.newFilePath) data.filePath = input.newFilePath;

    await this.prisma.mediaItem.update({ where: { id: mediaItemId }, data });
  }

  async applyTrackMetadata(mediaItemId: string, input: TrackMetadataInput): Promise<void> {
    await this.prisma.trackDetails.upsert({
      where: { mediaItemId },
      create: {
        mediaItemId,
        musicbrainzRecordingId: input.musicbrainzRecordingId,
        musicbrainzReleaseId: input.musicbrainzReleaseId,
        artistName: input.artistName,
        albumName: input.albumName,
        trackNumber: input.trackNumber,
        discNumber: input.discNumber,
        coverArtUrl: input.coverArtUrl,
      },
      update: {
        musicbrainzRecordingId: input.musicbrainzRecordingId,
        musicbrainzReleaseId: input.musicbrainzReleaseId,
        artistName: input.artistName,
        albumName: input.albumName,
        trackNumber: input.trackNumber,
        discNumber: input.discNumber,
        coverArtUrl: input.coverArtUrl,
      },
    });

    await this.prisma.mediaItem.update({
      where: { id: mediaItemId },
      data: { status: 'ready' },
    });
  }

  private async linkGenres(mediaItemId: string, genreNames: string[]): Promise<void> {
    for (const name of genreNames) {
      const genre = await this.prisma.genre.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      await this.prisma.mediaItemGenre.upsert({
        where: { mediaItemId_genreId: { mediaItemId, genreId: genre.id } },
        create: { mediaItemId, genreId: genre.id },
        update: {},
      });
    }
  }
}
