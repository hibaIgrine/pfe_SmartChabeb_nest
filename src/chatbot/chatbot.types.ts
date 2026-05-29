export interface ChatbotMessagePart {
  text: string;
}

export interface ChatbotHistoryMessage {
  // 'model' pour la réponse de l'IA, 'user' pour l'utilisateur
  role: 'user' | 'model';
  parts: ChatbotMessagePart[];
}

export interface ChatbotAskDto {
  message: string;
  history?: ChatbotHistoryMessage[];
  conversationId?: string;
}

export interface ChatbotResponseDto {
  response: string;
  conversationId: string;
}
