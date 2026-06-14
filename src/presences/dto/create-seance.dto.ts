/**
 * ============================================================
 * FICHIER : create-seance.dto.ts
 * RÔLE    : Valide les données pour créer une séance manuellement.
 * ============================================================
 *
 * Utilisé par : POST /presences/seances
 *
 * COMPORTEMENT DANS LE SERVICE :
 *   - createSeance() est idempotent : si une séance existe déjà pour (id_club, date_seance),
 *     elle est retournée sans créer de doublon.
 *   - Si date_seance est absent → date du jour (UTC) par défaut.
 *   - heure_debut / heure_fin sont stockées comme chaînes ISO datetime (optionnelles).
 *   - Une séance sans titre ni heures est valide (usage minimal pour le marquage de présence).
 *
 * CRÉATION AUTOMATIQUE :
 *   Le marquage de présence (POST /presences/mark) appelle aussi createSeance()
 *   si aucune séance n'est trouvée pour la date. Le flow manuel (POST /presences/seances)
 *   permet de préparer les séances à l'avance avec un titre et des horaires.
 */

import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateSeanceDto {
  /** UUID du club pour lequel créer la séance */
  @IsUUID()
  id_club!: string;

  /** Date de la séance au format YYYY-MM-DD (optionnel — date du jour si absent) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_seance?: string;

  /** Titre descriptif de la séance (ex: "Entraînement hebdomadaire") */
  @IsOptional()
  @IsString()
  titre?: string;

  /** Heure de début de la séance (chaîne ISO datetime, ex: "2024-01-15T09:00:00") */
  @IsOptional()
  @IsString()
  heure_debut?: string;

  /** Heure de fin de la séance (chaîne ISO datetime, ex: "2024-01-15T11:00:00") */
  @IsOptional()
  @IsString()
  heure_fin?: string;
}
