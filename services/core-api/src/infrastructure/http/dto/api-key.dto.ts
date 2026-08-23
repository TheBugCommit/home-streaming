import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [String], required: false, example: ['media:read'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}
