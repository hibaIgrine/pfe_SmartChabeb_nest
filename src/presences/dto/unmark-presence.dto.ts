/**
 * ============================================================
 * FICHIER : unmark-presence.dto.ts
 * RÔLE    : Valide les données pour supprimer le marquage de présence d'un membre.
 * ============================================================
 *
 * Utilisé par : POST /presences/unmark
 *
 * COMPORTEMENT DANS LE SERVICE (unmarkPresence) :
 *   - Effectue un deleteMany sur presences_clubs avec les filtres fournis :
 *       { id_club, id_utilisateur, id_seance? } ou { id_club, id_utilisateur, date_seance? }
 *   - Si aucun enregistrement ne correspond → l'opération réussit silencieusement (pas d'erreur).
 *   - Après suppression, le membre revient au statut NON_MARQUE (absence de record en BDD).
 *
 * USAGE TYPIQUE :
 *   Un responsable a marqué un membre ABSENT par erreur → il supprime le marquage
 *   puis remarque PRESENT.
 *
 * NOTE : id_seance ET date_presence sont optionnels mais il est recommandé d'en fournir
 *   au moins un pour cibler précisément le bon enregistrement.
 */

import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class UnmarkPresenceDto {
  /** UUID du club concerné */
  @IsUUID()
  id_club!: string;

  /** UUID du membre dont on supprime le marquage */
  @IsUUID()
  id_utilisateur!: string;

  /** UUID de la séance à démarquer (optionnel mais recommandé pour cibler précisément) */
  @IsOptional()
  @IsUUID()
  id_seance?: string;

  /** Date de la présence au format YYYY-MM-DD (alternative à id_seance) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_presence?: string;
}
