/**
 * ============================================================
 * FICHIER : mark-presence.dto.ts
 * RÔLE    : Valide les données pour marquer la présence d'un membre à une séance.
 * ============================================================
 *
 * Utilisé par : POST /presences/mark
 *
 * COMPORTEMENT DANS LE SERVICE :
 *   - Si id_seance est fourni → utilise cette séance directement (sans chercher par date).
 *   - Si id_seance est absent + date_presence fournie → cherche la séance du jour.
 *   - Si aucune séance trouvée → createSeance() est appelé automatiquement (idempotent).
 *   - Si date_presence est absent → normalizeDate() utilise la date du jour (UTC).
 *   - L'upsert se fait sur (id_club, id_utilisateur, id_seance) — clé composite.
 *
 * PRÉ-REQUIS SERVICE :
 *   - L'utilisateur (id_utilisateur) doit avoir une inscription ACCEPTE dans ce club.
 *   - Le responsable doit avoir le droit sur ce club (assertCanManageClub).
 *
 * STATUTS ACCEPTÉS : PRESENT | ABSENT (NON_MARQUE n'est pas un statut actif — c'est l'absence de record)
 */

import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class MarkPresenceDto {
  /** UUID du club concerné */
  @IsUUID()
  id_club!: string;

  /** UUID du membre dont on enregistre la présence */
  @IsUUID()
  id_utilisateur!: string;

  /** Date au format YYYY-MM-DD (optionnel — date du jour si absent) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_presence?: string;

  /** UUID de la séance (optionnel — cherchée/créée automatiquement par date si absent) */
  @IsOptional()
  @IsUUID()
  id_seance?: string;

  /** Statut de présence : PRESENT ou ABSENT (NON_MARQUE = absence de record, pas un statut actif) */
  @IsString()
  @IsIn(['PRESENT', 'ABSENT'])
  statut!: 'PRESENT' | 'ABSENT';

  /** Remarque libre (max 255 caractères, ex: "Arrivé en retard") */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarque?: string;
}
