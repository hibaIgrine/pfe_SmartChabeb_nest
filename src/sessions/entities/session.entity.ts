/**
 * ============================================================
 * FICHIER : session.entity.ts
 * RÔLE    : Interfaces TypeScript représentant une session de recommandation ML.
 * ============================================================
 *
 * Une « Session ML » capture l'état complet d'une séance de club au moment
 * où le coach demande une recommandation d'activité pour la prochaine séance.
 * Elle constitue la mémoire contextuelle transmise au modèle ML.
 *
 * SessionClub — sous-objet club enrichi :
 *   id          : UUID du club (table clubs)
 *   nom         : nom affiché du club
 *   nom_dataset : nom du club tel qu'il apparaît dans le dataset d'entraînement
 *                 (peut différer du nom affiché — clé critique pour l'encodage ML)
 *   domaine     : catégorie métier résolue par resolveDomaine() depuis clubs.categorie
 *                 Valeurs : 'Sport' | 'Arts' | 'Numérique' | 'Culture' | 'Citoyenneté' | 'Intellectuel'
 *
 * Session — entité principale (correspond à recommendation_sessions en BDD) :
 *
 *   IDENTITÉ :
 *     id           : clé primaire entière auto-incrémentée
 *     club_id      : UUID FK vers clubs
 *     club         : objet SessionClub (include Prisma)
 *     activite_choisie : activité que le coach a finalement retenue parmi les suggestions
 *                        (null si aucun choix fait encore — lu depuis recommendation_history)
 *
 *   PROFIL DU GROUPE :
 *     tranche_age  : classe d'âge des membres (ex: '13-17 ans')
 *     niveau       : niveau pédagogique ('Débutant', 'Intermédiaire', 'Avancé')
 *
 *   CONTEXTE TEMPOREL :
 *     num_seance   : numéro ordinal de la séance dans le cycle (1, 2, 3...)
 *     phase_annee  : période pédagogique ('Début', 'Milieu', 'Fin', 'Vacances')
 *     saison       : saison météorologique ('Printemps', 'Été', 'Automne', 'Hiver')
 *     mois         : mois numérique 1-12
 *     jour_semaine : jour de la semaine ('Lundi'...'Dimanche')
 *
 *   LOGISTIQUE :
 *     format_seance   : format pédagogique ('Individuel', 'Binôme', 'Groupe', 'Collectif')
 *     lieu            : espace physique ('Salle', 'Extérieur', 'Terrain'...)
 *     duree_minutes   : durée effective en minutes
 *
 *   HISTORIQUE DES ACTIVITÉS (contexte pédagogique) :
 *     activite_j_minus_2   : activité il y a 2 séances (null = 'Aucune' dans Flask)
 *     activite_precedente  : activité de la séance juste avant (null = 'Aucune')
 *     activite_actuelle    : activité EN COURS — c'est pour CETTE séance que
 *                            le coach évalue et demande la recommandation suivante
 *
 *   ÉTAT QUALITATIF DU GROUPE :
 *     difficulte       : difficulté ressentie ('Faible', 'Moyenne', 'Élevée')
 *     niveau_fatigue   : fatigue observée ('Faible', 'Modérée', 'Élevée')
 *     humeur_groupe    : ambiance ('Enthousiaste', 'Neutre', 'Découragé')
 *
 *   MÉTRIQUES QUANTITATIVES :
 *     score_engagement : engagement 0.0-10.0 (participation, attention, interaction)
 *     nb_membres_total : effectif total du club ce jour
 *     nb_presents      : membres effectivement présents
 *     taux_presence    : nb_presents / nb_membres_total × 100
 *     note_technique   : maîtrise des gestes/compétences 0.0-10.0
 *     note_comportement: discipline et esprit d'équipe 0.0-10.0
 *
 *   ÉVALUATION DU COACH :
 *     evaluation_coach     : appréciation globale ('Excellent', 'Bien', 'Satisfaisant', 'À améliorer')
 *     progression_observee : tendance détectée ('Forte', 'Modérée', 'Faible', 'Régression')
 *
 *   CONTEXTE ENVIRONNEMENTAL :
 *     meteo              : conditions météo ('Ensoleillé', 'Nuageux', 'Pluvieux', 'Chaud', 'Froid')
 *     activite_exterieure: 'Oui' | 'Non' — converti en binaire 1/0 dans Flask
 *
 *   GESTION PÉDAGOGIQUE :
 *     repetition_activite : nombre de fois que l'activité actuelle a déjà été faite dans le cycle
 *     sequence_logique    : 1 = séquence cohérente, 0 = rupture de séquence pédagogique
 *
 *   MÉTADONNÉE :
 *     created_at : ISO string de la date de création
 */
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
