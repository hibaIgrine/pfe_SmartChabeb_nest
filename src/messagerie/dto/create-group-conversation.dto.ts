/**
 * DTO pour créer une conversation de groupe.
 * Le créateur est automatiquement ajouté avec le rôle ADMIN.
 * Les participantIds sont dédupliqués et filtrés (exclude le créateur).
 * Au moins un autre utilisateur est requis après déduplication.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateGroupConversationDto {
  /** Nom du groupe (minimum 2 caractères). */
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title: string;

  /** UUIDs des participants à inviter (hors créateur, dédupliqués, compte actif requis). */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantIds: string[];
}
