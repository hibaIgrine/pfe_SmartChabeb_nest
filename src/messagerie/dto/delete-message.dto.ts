/**
 * DTO pour supprimer un message.
 *   scope=ME       → soft delete personnel via message_deleted_for_users (upsert).
 *   scope=EVERYONE → hard delete visible : contenu remplacé par "Message supprimé",
 *                    media effacé, deleted_for_everyone_at défini.
 *                    Réservé à l'auteur du message (ForbiddenException sinon).
 */
import { IsEnum } from 'class-validator';

export enum DeleteMessageScope {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}

export class DeleteMessageDto {
  /** Portée de la suppression : 'ME' (soi uniquement) ou 'EVERYONE' (pour tous). */
  @IsEnum(DeleteMessageScope)
  scope!: DeleteMessageScope;
}
