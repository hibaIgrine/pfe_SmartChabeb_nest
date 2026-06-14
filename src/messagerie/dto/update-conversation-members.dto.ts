/**
 * DTO pour ajouter des membres à un groupe.
 * Réservé aux ADMIN ou créateur du groupe.
 * Les doublons sont ignorés (createMany skipDuplicates: true).
 * Les membres ajoutés reçoivent le rôle MEMBER.
 * Chaque utilisateur doit avoir un compte actif (assertUserCanChat).
 */
import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateConversationMembersDto {
  /** UUIDs des utilisateurs à ajouter au groupe. */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds: string[];
}
