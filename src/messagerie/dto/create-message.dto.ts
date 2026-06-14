/**
 * DTO pour envoyer un message dans une conversation.
 * Règle de validation (assertPrivateMessagePayload) :
 *   - type TEXT  → content est obligatoire.
 *   - type IMAGE/VIDEO/DOCUMENT → media doit contenir au moins une URL.
 * Les URLs media sont dédupliquées et trimées (normalizeMediaUrls).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export const messageTypes = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const;

export type MessageType = (typeof messageTypes)[number];

export class CreateMessageDto {
  @ApiProperty({ enum: messageTypes })
  @IsString()
  @IsIn(messageTypes)
  type: MessageType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];
}
