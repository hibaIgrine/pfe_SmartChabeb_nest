export interface SessionClub {
  id: string;
  nom: string;
  nom_dataset: string | null;
  domaine: string;
}

export interface Session {
  id: number;
  club_id: string;
  club: SessionClub;
  activite_choisie: string | null;
  tranche_age: string;
  niveau: string;
  num_seance: number;
  phase_annee: string;
  saison: string;
  mois: number;
  jour_semaine: string;
  format_seance: string;
  lieu: string;
  duree_minutes: number;
  activite_j_minus_2: string | null;
  activite_precedente: string | null;
  activite_actuelle: string;
  difficulte: string;
  niveau_fatigue: string;
  humeur_groupe: string;
  score_engagement: number;
  nb_membres_total: number;
  nb_presents: number;
  taux_presence: number;
  note_technique: number;
  note_comportement: number;
  evaluation_coach: string;
  progression_observee: string;
  meteo: string;
  activite_exterieure: string;
  repetition_activite: number;
  sequence_logique: number;
  created_at: string;
}
