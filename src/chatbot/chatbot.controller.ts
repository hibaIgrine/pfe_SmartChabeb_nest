import { Controller, Post, Body } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import type { ChatbotAskDto } from './chatbot.types';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  async ask(@Body() body: ChatbotAskDto) {
    const reply = await this.chatbotService.getChatResponse(
      body.history ?? [],
      body.message,
    );
    return { response: reply };
  }
}
