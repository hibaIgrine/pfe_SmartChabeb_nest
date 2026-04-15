import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const publicationMediaTypes = [
  'image',
  'video',
  'document',
] as const;

export type PublicationMediaType = (typeof publicationMediaTypes)[number];

export class PublicationMediaItemDto {
  @ApiProperty({ enum: publicationMediaTypes })
  @IsString()
  @IsIn(publicationMediaTypes)
  type: PublicationMediaType;

  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ type: [PublicationMediaItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  media?: PublicationMediaItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mentioned_user_ids?: string[];
}