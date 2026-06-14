/**
 * ============================================================
 * FICHIER : messagerie.controller.ts
 * RÔLE    : Routes HTTP REST pour la messagerie.
 * ============================================================
 *
 * BASE URL : /messagerie
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   GET    /messagerie/users
 *     → Liste tous les utilisateurs disponibles pour initier une conversation
 *       (délègue à UsersService.findAllForMessaging, exclut l'appelant).
 *
 *   GET    /messagerie/unread-count
 *     → Nombre total de messages non lus (status SENT ou DELIVERED), hors sourdines actives.
 *
 *   PATCH  /messagerie/presence/heartbeat
 *     → Met is_online=true et last_seen_at=now pour l'utilisateur courant.
 *       À appeler périodiquement (ex: toutes les 60s) pour maintenir la présence.
 *
 *   PATCH  /messagerie/presence/offline
 *     → Met is_online=false et last_seen_at=now (déconnexion explicite).
 *
 *   POST   /messagerie/conversations/private   body: CreateConversationDto
 *     → Crée (ou retourne si existante) une conversation privée via upsert sur private_key.
 *
 *   POST   /messagerie/conversations/group     body: CreateGroupConversationDto
 *     → Crée un groupe. Le créateur devient ADMIN, les autres MEMBER.
 *
 *   GET    /messagerie/conversations/me
 *     → Liste toutes les conversations de l'utilisateur (triées par last_message_at DESC).
 *       Déclenche cleanupExpiredMutes() et marque les messages SENT → DELIVERED.
 *
 *   GET    /messagerie/conversations/:id
 *     → Détail d'une conversation avec participants complets et tous messages.
 *
 *   DELETE /messagerie/conversations/:id
 *     → Supprime pour tout le monde (privée ou admin groupe) ou quitte le groupe (membre).
 *
 *   GET    /messagerie/conversations/:id/messages
 *     → Tous les messages de la conversation (hors supprimés pour moi), en $transaction
 *       avec mise à jour SENT→DELIVERED.
 *
 *   GET    /messagerie/conversations/:id/typing
 *     → Participants en train d'écrire (last_typing_at dans les 8 dernières secondes).
 *
 *   PATCH  /messagerie/conversations/:id/typing    body: UpdateTypingDto
 *     → Met à jour l'état de frappe de l'utilisateur (HTTP fallback du WebSocket).
 *
 *   PATCH  /messagerie/conversations/:id/archive   body: UpdateConversationArchiveDto
 *     → Archive/désarchive la conversation pour l'utilisateur courant uniquement.
 *
 *   PATCH  /messagerie/conversations/:id/mute      body: UpdateConversationMuteDto
 *     → Active/désactive la sourdine (mode '1H' ou 'UNTIL_REACTIVATED').
 *
 *   PATCH  /messagerie/conversations/:id/title     body: UpdateConversationTitleDto
 *     → Renomme le groupe (réservé aux ADMIN ou créateur).
 *
 *   PATCH  /messagerie/conversations/:id/read
 *     → Marque tous les messages DELIVERED → READ et met à jour last_read_at.
 *
 *   POST   /messagerie/conversations/:id/members   body: UpdateConversationMembersDto
 *     → Ajoute des membres au groupe (réservé aux ADMIN).
 *
 *   DELETE /messagerie/conversations/:id/members/:memberUserId
 *     → Retire un membre du groupe (réservé aux ADMIN ; le créateur ne peut pas être retiré).
 *
 *   POST   /messagerie/conversations/:id/messages  body: CreateMessageDto
 *     → Envoie un message (TEXT|IMAGE|VIDEO|DOCUMENT) dans la conversation.
 *
 *   PATCH  /messagerie/conversations/:id/messages/:messageId  body: UpdateMessageDto
 *     → Modifie le contenu d'un message (auteur uniquement) → met edited_at.
 *
 *   PATCH  /messagerie/conversations/:id/messages/:messageId/pin  body: UpdateMessagePinDto
 *     → Épingle ou désépingle un message (tout participant).
 *
 *   DELETE /messagerie/conversations/:id/messages/:messageId  body: DeleteMessageDto
 *     → scope=EVERYONE : suppression pour tous (auteur uniquement) — efface content/media.
 *     → scope=ME       : suppression personnelle via message_deleted_for_users.
 */

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
import { UpdateConversationArchiveDto } from './dto/update-conversation-archive.dto';
import { UpdateConversationMuteDto } from './dto/update-conversation-mute.dto';
import { UpdateConversationMembersDto } from './dto/update-conversation-members.dto';
import { UpdateMessagePinDto } from './dto/update-message-pin.dto';
import { UpdateConversationTitleDto } from './dto/update-conversation-title.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { UpdateTypingDto } from './dto/update-typing.dto';
import { MessagerieService } from './messagerie.service';
import { UsersService } from 'src/users/users.service';

@Controller('messagerie')
@UseGuards(AuthGuard('jwt'))
export class MessagerieController {
  constructor(
    private readonly messagerieService: MessagerieService,
    private readonly usersService: UsersService,
  ) {}

  @Get('users')
  getMessengerUsers(@Request() req: any) {
    return this.usersService.findAllForMessaging(req.user.userId);
  }

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

  @Get('conversations/:id/typing')
  getTypingStatus(@Param('id') conversationId: string, @Request() req: any) {
    return this.messagerieService.getTypingStatus(
      conversationId,
      req.user.userId,
    );
  }

  @Patch('conversations/:id/typing')
  updateTypingStatus(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: UpdateTypingDto,
  ) {
    return this.messagerieService.updateTypingStatus(
      conversationId,
      req.user.userId,
      body,
    );
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') conversationId: string, @Request() req: any) {
    return this.messagerieService.deleteConversation(
      conversationId,
      req.user.userId,
    );
  }

  @Patch('conversations/:id/archive')
  updateConversationArchive(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: UpdateConversationArchiveDto,
  ) {
    return this.messagerieService.updateConversationArchive(
      conversationId,
      req.user.userId,
      body,
    );
  }

  @Patch('conversations/:id/mute')
  updateConversationMute(
    @Param('id') conversationId: string,
    @Request() req: any,
    @Body() body: UpdateConversationMuteDto,
  ) {
    return this.messagerieService.updateConversationMute(
      conversationId,
      req.user.userId,
      body,
    );
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

  @Patch('conversations/:id/messages/:messageId/pin')
  updateMessagePin(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
    @Body() body: UpdateMessagePinDto,
  ) {
    return this.messagerieService.updateMessagePin(
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
