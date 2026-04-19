import {
  Body,
  Controller,
  Patch,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagerieService } from './messagerie.service';

@Controller('messagerie')
@UseGuards(AuthGuard('jwt'))
export class MessagerieController {
  constructor(private readonly messagerieService: MessagerieService) {}

  @Get('unread-count')
  getUnreadCount(@Request() req: any) {
    return this.messagerieService.getUnreadMessagesCount(req.user.userId);
  }

  @Post('conversations/private')
  createPrivateConversation(
    @Request() req: any,
    @Body() body: CreateConversationDto,
  ) {
    return this.messagerieService.createPrivateConversation(
      req.user.userId,
      body,
    );
  }

  @Get('conversations/me')
  getMyConversations(@Request() req: any) {
    return this.messagerieService.getMyConversations(req.user.userId);
  }

  @Get('conversations/:id')
  getConversationById(@Param('id') id: string, @Request() req: any) {
    return this.messagerieService.getConversationById(id, req.user.userId);
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

  @Patch('conversations/:id/read')
  markConversationAsRead(
    @Param('id') conversationId: string,
    @Request() req: any,
  ) {
    return this.messagerieService.markConversationAsRead(
      conversationId,
      req.user.userId,
    );
  }
}
