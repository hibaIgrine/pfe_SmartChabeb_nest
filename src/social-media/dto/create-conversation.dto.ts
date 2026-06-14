/**
 * DTO legacy pour créer une conversation depuis le module social-media.
 * Non utilisé dans l'implémentation actuelle — la gestion des conversations
 * a été déplacée dans le module dédié `messagerie` (MessagerieController).
 * Conservé pour rétrocompatibilité ou usage futur.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ enum: ['private', 'group'] })
  @IsString()
  @IsIn(['private', 'group'])
  type: 'private' | 'group';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantIds: string[];
}