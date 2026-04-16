import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class StoryMediaDto {
  @IsString()
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  url!: string;
}

export class CreateStoryDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoryMediaDto)
  media?: StoryMediaDto[];
}
