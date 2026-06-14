/**
 * DTO pour activer ou désactiver la mise en sourdine d'une conversation.
 * La sourdine masque les notifications de nouveaux messages pour l'utilisateur courant.
 *   is_muted=true, mode='1H'               → muted_until = now + 1h
 *   is_muted=true, mode='UNTIL_REACTIVATED' → muted_until = null (permanent)
 *   is_muted=false                          → muted_at = null, muted_until = null
 * getUnreadMessagesCount() exclut les conversations avec sourdine active.
 */
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateConversationMuteDto {
  /** true = activer la sourdine, false = désactiver. */
  @IsBoolean()
  is_muted: boolean;

  /** Durée de la sourdine : '1H' (expire dans 1h) ou 'UNTIL_REACTIVATED' (permanent). */
  @IsOptional()
  @IsIn(['1H', 'UNTIL_REACTIVATED'])
  mode?: '1H' | 'UNTIL_REACTIVATED';
}
