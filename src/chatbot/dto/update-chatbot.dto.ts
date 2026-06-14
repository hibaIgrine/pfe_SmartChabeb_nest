/**
 * DTO de mise à jour chatbot — généré par NestJS CLI, actuellement vide.
 * Les conversations chatbot ne sont pas modifiées via une route HTTP — elles sont
 * créées et étendues automatiquement à chaque appel de POST /chatbot/ask.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateChatbotDto } from './create-chatbot.dto';

export class UpdateChatbotDto extends PartialType(CreateChatbotDto) {}
