/**
 * DTO pour créer ou récupérer une conversation privée (1-à-1).
 * Le service fait un upsert sur private_key = sort([userId, recipientId]).join(':')
 * → idempotent : appeler deux fois retourne la même conversation.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  /** UUID de l'interlocuteur. Doit être différent de l'utilisateur courant et avoir un compte actif. */
  @ApiProperty()
  @IsUUID()
  recipientId: string;
}
