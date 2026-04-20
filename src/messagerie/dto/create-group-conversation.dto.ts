import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateGroupConversationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantIds: string[];
}
