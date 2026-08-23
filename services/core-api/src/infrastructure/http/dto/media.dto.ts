import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListMediaQueryDto {
  @ApiPropertyOptional({ enum: ['movie', 'episode', 'track'] })
  @IsOptional()
  @IsIn(['movie', 'episode', 'track'])
  type?: 'movie' | 'episode' | 'track';

  @ApiPropertyOptional({
    enum: ['pending', 'downloading', 'downloaded', 'transcoding', 'transcoded', 'ready', 'failed'],
  })
  @IsOptional()
  @IsIn(['pending', 'downloading', 'downloaded', 'transcoding', 'transcoded', 'ready', 'failed'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genreId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seriesId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class UpdateMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;
}
