import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatbotService } from './chatbot.service';
import type { ChatbotAskDto } from './chatbot.types';

@UseGuards(AuthGuard('jwt'))
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  async ask(@Request() req: any, @Body() body: ChatbotAskDto) {
    return this.chatbotService.getChatResponse(
      req.user.userId,
      body.history ?? [],
      body.message,
      body.conversationId,
    );
  }

  @Get('conversations')
  async getMyConversations(@Request() req: any) {
    return this.chatbotService.getUserConversations(req.user.userId);
  }

  @Get('conversations/:conversationId')
  async getConversation(
    @Request() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatbotService.getUserConversation(
      req.user.userId,
      conversationId,
    );
  }
}
