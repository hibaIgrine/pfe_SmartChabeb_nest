export interface ChatbotMessagePart {
  text: string;
}

export interface ChatbotHistoryMessage {
  role: 'user' | 'model';
  parts: ChatbotMessagePart[];
}

export interface ChatbotAskDto {
  message: string;
  history?: ChatbotHistoryMessage[];
}
