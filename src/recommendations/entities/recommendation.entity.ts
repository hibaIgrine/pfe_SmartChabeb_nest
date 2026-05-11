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
