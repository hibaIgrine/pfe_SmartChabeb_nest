/**
 * DTO pour mettre à jour l'état "en train d'écrire" via HTTP.
 * is_typing=true  → last_typing_at = now.
 * is_typing=false → last_typing_at = null.
 * NOTE : en production, l'événement WebSocket "conversation:typing" est préférable
 * car il propage instantanément l'état à tous les membres de la room.
 */
import { IsBoolean } from 'class-validator';

export class UpdateTypingDto {
  /** true = commence à écrire, false = a arrêté d'écrire. */
  @IsBoolean()
  is_typing: boolean;
}
