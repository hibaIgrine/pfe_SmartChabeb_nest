/**
 * DTO pour archiver ou désarchiver une conversation.
 * L'archivage est personnel : archived_at est stocké sur conversation_participants,
 * pas sur la conversation elle-même. Seul l'utilisateur courant est affecté.
 */
import { IsBoolean } from 'class-validator';

export class UpdateConversationArchiveDto {
  /** true = archiver, false = désarchiver. */
  @IsBoolean()
  is_archived: boolean;
}
