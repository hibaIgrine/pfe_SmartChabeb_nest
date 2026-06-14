/**
 * ============================================================
 * FICHIER : chatbot.types.ts
 * RÔLE    : Interfaces TypeScript partagées entre controller et service.
 * ============================================================
 *
 * CONVENTION DE RÔLES (format Google Gemini, adapté pour Groq) :
 *   ChatbotHistoryMessage.role = 'user'  → message envoyé par l'utilisateur
 *   ChatbotHistoryMessage.role = 'model' → réponse générée par l'IA
 *   Ce format diffère du format Groq ('assistant') — la conversion est faite
 *   dans normalizeHistory() du service ('model' → 'assistant').
 *
 * FORMAT MULTI-PARTIES :
 *   parts: ChatbotMessagePart[] permet de représenter un message en plusieurs
 *   segments textuels. En pratique, chaque message n'a qu'une seule part.
 *
 * UTILISATION DANS LE FLUX :
 *   1. Le front-end envoie POST /chatbot/ask avec ChatbotAskDto :
 *      { message, history?, conversationId? }
 *   2. Le service retourne ChatbotResponseDto :
 *      { response, conversationId }
 *      conversationId est persisté par le front pour les messages suivants.
 */

/** Un segment de texte d'un message (en pratique toujours un seul par message) */
export interface ChatbotMessagePart {
  text: string;
}

/** Message de l'historique de conversation — format Google Gemini converti pour Groq */
export interface ChatbotHistoryMessage {
  /** 'model' pour la réponse de l'IA, 'user' pour l'utilisateur */
  role: 'user' | 'model';
  parts: ChatbotMessagePart[];
}

/** Corps de la requête POST /chatbot/ask */
export interface ChatbotAskDto {
  /** Message texte envoyé par l'utilisateur */
  message: string;
  /** Historique des échanges précédents (ignoré si conversationId est fourni) */
  history?: ChatbotHistoryMessage[];
  /** UUID de la conversation existante à continuer (optionnel) */
  conversationId?: string;
}

/** Réponse retournée par POST /chatbot/ask */
export interface ChatbotResponseDto {
  /** Texte de la réponse générée par le LLM */
  response: string;
  /** UUID de la conversation sauvegardée (nouvelle ou existante) */
  conversationId: string;
}
