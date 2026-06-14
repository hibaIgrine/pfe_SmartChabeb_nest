/**
 * ============================================================
 * FICHIER : create-seance-feedback.dto.ts
 * RÔLE    : Valide les données de feedback qu'un adhérent soumet pour une séance.
 * ============================================================
 *
 * Utilisé par : POST /presences/adherent/seances/:seanceId/feedback
 *
 * CONDITIONS REQUISES (vérifiées dans PresencesService.submitSeanceFeedback) :
 *   - L'utilisateur doit avoir un statut PRESENT dans presences_clubs pour cette séance.
 *   - La séance doit être passée (date_seance ≤ maintenant).
 *   - Si ces conditions ne sont pas remplies → ForbiddenException / NotFoundException.
 *
 * UPSERT :
 *   Le service effectue un upsert sur la clé composite (id_seance, id_utilisateur).
 *   Un adhérent peut donc modifier son feedback après soumission.
 *   Table accédée via `this.prisma as any` (seance_feedbacks non typé dans Prisma Client).
 *
 * NOTES :
 *   - note_coach et note_activites : entiers de 1 (mauvais) à 5 (excellent)
 *   - commentaire : texte libre, max 500 caractères
 */

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSeanceFeedbackDto {
  /** Note attribuée au coach (1 = mauvais, 5 = excellent) */
  @IsInt()
  @Min(1)
  @Max(5)
  note_coach: number;

  /** Note attribuée aux activités proposées lors de la séance (1 à 5) */
  @IsInt()
  @Min(1)
  @Max(5)
  note_activites: number;

  /** Commentaire libre sur la séance (optionnel, max 500 caractères) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
