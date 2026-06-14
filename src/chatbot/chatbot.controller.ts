/**
 * ============================================================
 * FICHIER : chatbot.controller.ts
 * RÔLE    : Routes HTTP pour interagir avec le chatbot IA et consulter l'historique.
 * ============================================================
 *
 * BASE URL : /chatbot
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   POST /chatbot/ask                              [JWT requis]
 *     → Envoie un message au chatbot et reçoit une réponse IA.
 *     → Body : ChatbotAskDto { message, history?, conversationId? }
 *         message        : texte saisi par l'utilisateur (obligatoire)
 *         history        : échanges précédents [{role, parts}] (ignoré si conversationId fourni)
 *         conversationId : UUID d'une conversation existante à continuer (optionnel)
 *     → Si conversationId absent → nouvelle conversation créée en BDD.
 *     → Si conversationId fourni → messages ajoutés à la conversation existante.
 *     → Retourne : { response: string, conversationId: string }
 *
 *   GET /chatbot/conversations                     [JWT requis]
 *     → Liste les 20 dernières conversations chatbot de l'utilisateur (triées updated_at DESC).
 *     → Retourne : [{ id, title, messages, updatedAt }]
 *
 *   GET /chatbot/conversations/:conversationId     [JWT requis]
 *     → Récupère une conversation spécifique avec tous ses messages.
 *     → NotFoundException si la conversation n'appartient pas à l'utilisateur.
 *     → Retourne : { id, title, messages, updatedAt }
 */

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

  /**
   * POST /chatbot/ask
   * Envoie un message au LLM Groq (après classification scope) et sauvegarde la conversation.
   * history[] est ignoré si conversationId est fourni (l'historique est chargé depuis la BDD).
   */
  @Post('ask')
  async ask(@Request() req: any, @Body() body: ChatbotAskDto) {
    return this.chatbotService.getChatResponse(
      req.user.userId,
      body.history ?? [],
      body.message,
      body.conversationId,
    );
  }

  /**
   * GET /chatbot/conversations
   * 20 dernières conversations chatbot de l'utilisateur, triées par updated_at DESC.
   */
  @Get('conversations')
  async getMyConversations(@Request() req: any) {
    return this.chatbotService.getUserConversations(req.user.userId);
  }

  /**
   * GET /chatbot/conversations/:conversationId
   * Conversation spécifique avec tous ses messages. NotFoundException si non trouvée.
   */
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
