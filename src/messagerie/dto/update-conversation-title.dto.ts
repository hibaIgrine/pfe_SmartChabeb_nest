/**
 * DTO pour renommer un groupe.
 * Réservé aux ADMIN ou créateur du groupe (assertGroupAdmin).
 * Le titre est normalisé (trim) et validé (assertValidGroupTitle : non-vide).
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateConversationTitleDto {
  /** Nouveau nom du groupe (minimum 2 caractères). */
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title: string;
}
