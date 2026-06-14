/**
 * DTO pour créer une session ML — saisie complète du contexte de séance par le coach.
 *
 * Ce DTO correspond aux 30 features attendues par le modèle ML.
 * Chaque champ est décrit avec sa signification pédagogique/ML.
 *
 * IDENTITÉ DU CLUB :
 *   club_id       — UUID FK vers clubs (résolution du nom_dataset + domaine par le service)
 *
 * PROFIL DU GROUPE :
 *   tranche_age   — classe d'âge : '6-12 ans' | '13-17 ans' | '18-25 ans' | '26+ ans'
 *   niveau        — niveau pédagogique : 'Débutant' | 'Intermédiaire' | 'Avancé'
 *
 * CONTEXTE TEMPOREL :
 *   num_seance    — numéro ordinal (min 1). Le modèle détecte les patterns début/fin de cycle.
 *   phase_annee   — période pédagogique : 'Début' | 'Milieu' | 'Fin' | 'Vacances'
 *   saison        — 'Printemps' | 'Été' | 'Automne' | 'Hiver'
 *   mois          — 1-12
 *   jour_semaine  — 'Lundi' | 'Mardi' | ... | 'Dimanche'
 *
 * LOGISTIQUE :
 *   format_seance — 'Individuel' | 'Binôme' | 'Groupe' | 'Collectif'
 *   lieu          — 'Salle' | 'Extérieur' | 'Terrain' | 'Piscine' | ...
 *   duree_minutes — durée effective (min 1). Impacte la fatigue prévisible.
 *
 * HISTORIQUE DES ACTIVITÉS :
 *   activite_j_minus_2   — (optionnel) activité il y a 2 séances. null → 'Aucune' dans Flask.
 *   activite_precedente  — (optionnel) activité dernière séance. null → 'Aucune' dans Flask.
 *   activite_actuelle    — activité EN COURS. C'est pour CETTE séance que le coach
 *                          évalue et demande la recommandation pour la SUIVANTE.
 *
 * ÉTAT QUALITATIF DU GROUPE :
 *   difficulte       — difficulté ressentie : 'Faible' | 'Moyenne' | 'Élevée'
 *   niveau_fatigue   — fatigue observée : 'Faible' | 'Modérée' | 'Élevée'
 *   humeur_groupe    — ambiance : 'Enthousiaste' | 'Neutre' | 'Découragé'
 *
 * MÉTRIQUES QUANTITATIVES :
 *   score_engagement — engagement global 0.0-10.0 (participation + attention + interaction)
 *   nb_membres_total — effectif total présent potentiellement
 *   nb_presents      — membres effectivement présents (min 0)
 *   taux_presence    — ratio nb_presents/nb_membres_total×100. Peut être calculé ou saisi.
 *   note_technique   — maîtrise technique 0.0-10.0
 *   note_comportement— discipline et esprit d'équipe 0.0-10.0
 *
 * ÉVALUATION DU COACH :
 *   evaluation_coach     — appréciation : 'Excellent' | 'Bien' | 'Satisfaisant' | 'À améliorer'
 *   progression_observee — tendance : 'Forte' | 'Modérée' | 'Faible' | 'Régression'
 *
 * CONTEXTE ENVIRONNEMENTAL :
 *   meteo              — conditions : 'Ensoleillé' | 'Nuageux' | 'Pluvieux' | 'Chaud' | 'Froid'
 *   activite_exterieure— (optionnel) 'Oui' | 'Non'. Défaut 'Non'. Converti en 1/0 dans Flask.
 *
 * GESTION PÉDAGOGIQUE :
 *   repetition_activite — (optionnel) Nombre de fois que l'activité actuelle a déjà été faite
 *                         dans le cycle courant. Défaut 0. Le modèle évite la sur-répétition.
 *   sequence_logique    — (optionnel) 1 = enchaînement pédagogique cohérent, 0 = rupture.
 *                         Défaut 1.
 */
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  club_id: string;

  @IsString()
  tranche_age: string;

  @IsString()
  niveau: string;

  @IsInt()
  @Min(1)
  num_seance: number;

  @IsString()
  phase_annee: string;

  @IsString()
  saison: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mois: number;

  @IsString()
  jour_semaine: string;

  @IsString()
  format_seance: string;

  @IsString()
  lieu: string;

  @IsInt()
  @Min(1)
  duree_minutes: number;

  @IsOptional()
  @IsString()
  activite_j_minus_2?: string;

  @IsOptional()
  @IsString()
  activite_precedente?: string;

  @IsString()
  activite_actuelle: string;

  @IsString()
  difficulte: string;

  @IsString()
  niveau_fatigue: string;

  @IsString()
  humeur_groupe: string;

  @IsNumber()
  score_engagement: number;

  @IsInt()
  @Min(0)
  nb_membres_total: number;

  @IsInt()
  @Min(0)
  nb_presents: number;

  @IsNumber()
  taux_presence: number;

  @IsNumber()
  note_technique: number;

  @IsNumber()
  note_comportement: number;

  @IsString()
  evaluation_coach: string;

  @IsString()
  progression_observee: string;

  @IsString()
  meteo: string;

  @IsOptional()
  @IsString()
  activite_exterieure?: string;

  @IsOptional()
  @IsInt()
  repetition_activite?: number;

  @IsOptional()
  @IsInt()
  sequence_logique?: number;
}
