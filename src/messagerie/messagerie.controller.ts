import {
  Body,
  Controller,
  Patch,
  Get,
  Param,
  Post,
  Delete,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { UpdateConversationMembersDto } from './dto/update-conversation-members.dto';
import { UpdateConversationTitleDto } from './dto/update-conversation-title.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessagerieService } from './messagerie.service';

@Controller('messagerie')
@UseGuards(AuthGuard('jwt'))
export class MessagerieController {
  constructor(private readonly messagerieService: MessagerieService) {}

  @Get('unread-count')
  getUnreadCount(@Request() req: any) {
    return this.messagerieService.getUnreadMessagesCount(req.user.userId);
  }

  @Patch('presence/heartbeat')
  heartbeat(@Request() req: any) {
    return this.messagerieService.updateMyPresenceHeartbeat(req.user.userId);
  }

  @Patch('presence/offline')
  markOffline(@Request() req: any) {
    return this.messagerieService.updateMyPresenceOffline(req.user.userId);
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

  @Post('conversations/group')
  createGroupConversation(
    @Request() req: any,
    @Body() body: CreateGroupConversationDto,
  ) {
    return this.messagerieService.createGroupConversation(
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

  @Patch('conversations/:id/title')
  renameGroupConversation(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: UpdateConversationTitleDto,
  ) {
    return this.messagerieService.renameGroupConversation(
      conversationId,
      req.user.userId,
      body,
    );
  }

  @Post('conversations/:id/members')
  addGroupMembers(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: UpdateConversationMembersDto,
  ) {
    return this.messagerieService.addGroupMembers(
      conversationId,
      req.user.userId,
      body,
    );
  }

  @Delete('conversations/:id/members/:memberUserId')
  removeGroupMember(
    @Param('id') conversationId: string,
    @Param('memberUserId') memberUserId: string,
    @Request() req: any,
  ) {
    return this.messagerieService.removeGroupMember(
      conversationId,
      req.user.userId,
      memberUserId,
    );
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

  @Patch('conversations/:id/messages/:messageId')
  updateMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
    @Body() body: UpdateMessageDto,
  ) {
    return this.messagerieService.updateMessage(
      conversationId,
      messageId,
      req.user.userId,
      body,
    );
  }

  @Delete('conversations/:id/messages/:messageId')
  deleteMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
    @Body() body: DeleteMessageDto,
  ) {
    return this.messagerieService.deleteMessage(
      conversationId,
      messageId,
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
