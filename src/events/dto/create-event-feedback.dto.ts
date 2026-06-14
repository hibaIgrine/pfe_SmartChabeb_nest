/**
 * ============================================================
 * FICHIER : create-event-feedback.dto.ts
 * RÔLE    : Valide les données pour soumettre ou modifier un feedback d'événement.
 * ============================================================
 *
 * Utilisé par : POST /events/:id/feedback
 *
 * CONCEPT : feedback (avis)
 *   Un utilisateur ayant participé à un événement (statut CONFIRME ou ANNULE)
 *   peut laisser une note et un commentaire après le début de l'événement.
 *   Le feedback est upsert : modifiable après soumission initiale.
 *   Clé composite unique : (event_id, user_id) dans la table eventFeedbacks.
 *
 * VALIDATION :
 *   note       : entier entre 1 et 5 (étoiles)
 *   commentaire : texte optionnel, max 500 caractères
 *
 * VÉRIFICATIONS SUPPLÉMENTAIRES DANS LE SERVICE (submitEventFeedback) :
 *   - Participation existante avec statut CONFIRME ou ANNULE
 *   - event.start_time ≤ Date.now() (l'événement doit avoir commencé)
 *   - note est bien un entier (Number.isInteger)
 *   - commentaire trimmé, null si vide
 */

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventFeedbackDto {
  /** Note de 1 à 5 étoiles (entier obligatoire) */
  @IsInt()
  @Min(1)
  @Max(5)
  note: number;

  /** Commentaire optionnel (max 500 caractères) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
