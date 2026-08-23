import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class ApplyMetadataDto {
  @ApiProperty({ enum: ['movie', 'episode', 'track'] })
  @IsIn(['movie', 'episode', 'track'])
  mediaType!: 'movie' | 'episode' | 'track';

  // Movie fields
  @IsOptional() @IsInt() tmdbId?: number;
  @IsOptional() @IsString() imdbId?: string;
  @IsOptional() @IsString() overview?: string;
  @IsOptional() @IsInt() runtimeMinutes?: number;
  @IsOptional() @IsString() originalLanguage?: string;
  @IsOptional() @IsString() posterPath?: string;
  @IsOptional() @IsString() backdropPath?: string;
  @IsOptional() @IsInt() releaseYear?: number;
  @IsOptional() genreNames?: string[];

  // Episode fields
  @IsOptional() @IsString() seriesId?: string;
  @IsOptional() @IsString() seasonId?: string;
  @IsOptional() @IsInt() episodeNumber?: number;
  @IsOptional() @IsString() airDate?: string;
  @IsOptional() @IsString() episodeTitle?: string;
  @IsOptional() @IsString() newFilePath?: string;

  // Track fields
  @IsOptional() @IsString() musicbrainzRecordingId?: string;
  @IsOptional() @IsString() musicbrainzReleaseId?: string;
  @IsOptional() @IsString() artistName?: string;
  @IsOptional() @IsString() albumName?: string;
  @IsOptional() @IsInt() trackNumber?: number;
  @IsOptional() @IsInt() discNumber?: number;
  @IsOptional() @IsString() coverArtUrl?: string;
}

export class UpsertSeriesDto {
  @ApiProperty()
  @IsInt()
  tmdbId!: number;

  @ApiProperty()
  @IsString()
  title!: string;

  @IsOptional() @IsString() overview?: string;
  @IsOptional() @IsString() firstAirDate?: string;
  @IsOptional() @IsString() posterPath?: string;
  @IsOptional() @IsString() backdropPath?: string;
  @IsOptional() @IsIn(['ongoing', 'ended']) status?: 'ongoing' | 'ended';
  @IsOptional() genreNames?: string[];

  @ApiProperty()
  @IsInt()
  seasonNumber!: number;

  @IsOptional() @IsInt() seasonTmdbId?: number;
  @IsOptional() @IsString() seasonOverview?: string;
  @IsOptional() @IsString() seasonPosterPath?: string;
}
