import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AddParticipantDto } from './dto/add-participant.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagerieService } from './messagerie.service';

@Controller('messagerie')
@UseGuards(AuthGuard('jwt'))
export class MessagerieController {
  constructor(private readonly messagerieService: MessagerieService) {}

  @Post('conversations')
  createConversation(@Request() req: any, @Body() body: CreateConversationDto) {
    return this.messagerieService.createConversation(req.user.userId, body);
  }

  @Get('conversations/me')
  getMyConversations(@Request() req: any) {
    return this.messagerieService.getMyConversations(req.user.userId);
  }

  @Get('conversations/:id')
  getConversationById(@Param('id') id: string, @Request() req: any) {
    return this.messagerieService.getConversationById(id, req.user.userId);
  }

  @Post('conversations/:id/participants')
  addParticipant(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: AddParticipantDto,
  ) {
    return this.messagerieService.addParticipant(
      conversationId,
      req.user.userId,
      body.userId,
    );
  }

  @Get('conversations/:id/messages')
  getMessages(@Param('id') conversationId: string, @Request() req: any) {
    return this.messagerieService.getMessages(conversationId, req.user.userId);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: CreateMessageDto,
  ) {
    return this.messagerieService.sendMessage(
      conversationId,
      req.user.userId,
      body,
    );
  }
}
