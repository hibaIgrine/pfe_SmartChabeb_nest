/**
 * DTO legacy pour ajouter un participant à une conversation depuis social-media.
 * Non utilisé dans l'implémentation actuelle — la gestion des membres de groupe
 * est assurée par UpdateConversationMembersDto dans le module `messagerie`.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class AddConversationParticipantDto {
  /** UUID de l'utilisateur à ajouter. */
  @ApiProperty()
  @IsString()
  @IsUUID()
  userId: string;
}