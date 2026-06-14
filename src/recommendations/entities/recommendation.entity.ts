/**
 * ============================================================
 * FICHIER : recommendation.entity.ts
 * RÔLE    : Interfaces TypeScript pour les recommandations ML persistées.
 * ============================================================
 *
 * RecommendationItem — une activité suggérée par le modèle :
 *   activite    : nom de l'activité décodée (inverse_transform du LabelEncoder cible)
 *                 Ex: "Football", "Dessin", "Atelier Robotique"
 *   probabilite : confiance du modèle en % (0.0-100.0)
 *                 Calculé : round(float(proba[i]) * 100, 2)
 *                 Exemple : 42.75 signifie que le modèle est à 42.75% sûr
 *                 que c'est la meilleure activité suivante dans ce contexte.
 *
 * Recommendation — enregistrement complet dans recommendation_history :
 *   id              : clé primaire entière auto-incrémentée
 *   sessionId       : FK vers recommendation_sessions.id
 *   recommandations : tableau de RecommendationItem (3 par défaut, top_k max 10)
 *                     Stocké en JSON dans la colonne Prisma de type Json.
 *   modele_utilise  : nom du modèle ML qui a généré cette prédiction
 *                     (ex: "Random Forest", "Gradient Boosting")
 *                     Permet de tracer quel modèle a été utilisé si plusieurs versionscoexistent.
 *   activite_choisie: activité finalement retenue par le coach parmi les suggestions.
 *                     null tant que le coach n'a pas validé son choix.
 *                     Mise à jour via PATCH /recommendations/:id/choose.
 *                     C'est cette valeur qui constitue le "label" pour le futur
 *                     réentraînement du modèle (feedback loop).
 *   created_at      : ISO string de la date de génération
 */
export interface RecommendationItem {
  activite: string;
  probabilite: number;
}

export interface Recommendation {
  id: number;
  sessionId: number;
  recommandations: RecommendationItem[];
  modele_utilise: string;
  activite_choisie: string | null;
  created_at: string;
}
