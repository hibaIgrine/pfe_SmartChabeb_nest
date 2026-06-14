/**
 * ============================================================
 * FICHIER : event-timeline-step.dto.ts
 * RÔLE    : Valide une étape du programme détaillé d'un événement.
 * ============================================================
 *
 * CONCEPT : timeline
 *   La timeline est un tableau d'étapes décrivant le déroulement de l'événement
 *   (ex: "Accueil 09:00-09:30", "Compétition 09:30-12:00", "Remise des prix 12:00-12:30").
 *   Elle est stockée en JSON dans la colonne `timeline` de la table `events`.
 *
 * VALIDATION (dans normalizeTimeline du service) :
 *   - title   : obligatoire, non vide
 *   - start_time / end_time : format HH:mm ou HH:mm:ss
 *   - end_time > start_time (cohérence interne de l'étape)
 *   - start_time ≥ event.start_time et end_time ≤ event.end_time (dans les bornes)
 *   - Pas de chevauchement entre étapes (tri par start_time puis vérification)
 *   Le service trie les étapes par heure de début avant de les enregistrer.
 */

import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class EventTimelineStepDto {
  /** Titre de l'étape (ex: "Accueil", "Compétition", "Remise des prix") */
  @IsString()
  @IsNotEmpty()
  title!: string;

  /** Heure de début de l'étape au format HH:mm ou HH:mm:ss */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'timeline.start_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  start_time!: string;

  /** Heure de fin de l'étape (doit être > start_time et ≤ fin de l'événement) */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'timeline.end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time!: string;

  /** Description optionnelle de l'étape */
  @IsOptional()
  @IsString()
  details?: string;
}
