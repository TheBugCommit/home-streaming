import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UploadTorrentDto {
  @ApiProperty({ enum: ['movie', 'tv', 'music'] })
  @IsIn(['movie', 'tv', 'music'])
  contentType!: 'movie' | 'tv' | 'music';
}
