/**
 * DTO placeholder — les recommandations ne sont PAS créées via un body HTTP.
 * La création est déclenchée automatiquement via POST /recommendations/session/:sessionId
 * qui charge la session depuis la BDD et appelle directement Flask /predict.
 * Aucune donnée n'est saisie manuellement par l'utilisateur pour créer une recommandation.
 */
export class CreateRecommendationDto {}
