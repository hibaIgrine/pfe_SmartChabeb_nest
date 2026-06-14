/**
 * DTO pour épingler ou désépingler un message.
 * Tout participant à la conversation peut épingler/désépingler (pas uniquement l'ADMIN).
 * is_pinned=true  → pinned_at = now, pinned_by = userId courant.
 * is_pinned=false → pinned_at = null, pinned_by = null.
 */
import { IsBoolean } from 'class-validator';

export class UpdateMessagePinDto {
  /** true = épingler, false = désépingler. */
  @IsBoolean()
  is_pinned: boolean;
}
