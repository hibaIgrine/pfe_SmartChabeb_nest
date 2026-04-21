import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessagerieMuteService } from './messagerie-mute.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { DeleteMessageDto, DeleteMessageScope } from './dto/delete-message.dto';
import { UpdateConversationArchiveDto } from './dto/update-conversation-archive.dto';
import { UpdateConversationMembersDto } from './dto/update-conversation-members.dto';
import { UpdateConversationMuteDto } from './dto/update-conversation-mute.dto';
import { UpdateMessagePinDto } from './dto/update-message-pin.dto';
import { UpdateConversationTitleDto } from './dto/update-conversation-title.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { UpdateTypingDto } from './dto/update-typing.dto';
import {
  assertPrivateMessagePayload,
  assertValidGroupTitle,
  buildPrivateConversationKey,
  normalizeMediaUrls,
  normalizeMessageContent,
  normalizeConversationTitle,
  normalizeUserIds,
} from './messagerie.utils';

@Injectable()
export class MessagerieService {
  private readonly onlineWindowMs = 2 * 60 * 1000;
  private readonly typingWindowMs = 8 * 1000;

  private readonly participantPreviewSelect = {
    id: true,
    nom: true,
    prenom: true,
    photo_profil_url: true,
    is_online: true,
    last_seen_at: true,
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagerieMuteService: MessagerieMuteService,
  ) {}

  async updateMyPresenceHeartbeat(userId: string) {
    const now = new Date();

    await this.prisma.utilisateurs.update({
      where: { id: userId },
      data: {
        is_online: true,
        last_seen_at: now,
      },
    });

    return {
      is_online: true,
      last_seen_at: now,
    };
  }

  async updateMyPresenceOffline(userId: string) {
    const now = new Date();

    await this.prisma.utilisateurs.update({
      where: { id: userId },
      data: {
        is_online: false,
        last_seen_at: now,
      },
    });

    return {
      is_online: false,
      last_seen_at: now,
    };
  }

  async getUnreadMessagesCount(userId: string) {
    const now = new Date();

    const count = await this.prisma.messages.count({
      where: {
        sender_id: {
          not: userId,
        },
        status: {
          in: ['SENT', 'DELIVERED'],
        },
        deleted_for_everyone_at: null,
        deleted_for_users: {
          none: {
            user_id: userId,
          },
        },
        NOT: {
          conversation: {
            participants: {
              some: {
                user_id: userId,
                muted_at: {
                  not: null,
                },
                OR: [
                  {
                    muted_until: null,
                  },
                  {
                    muted_until: {
                      gt: now,
                    },
                  },
                ],
              },
            },
          },
        },
        conversation: {
          participants: {
            some: {
              user_id: userId,
            },
          },
        },
      },
    });

    return { count };
  }

  async createPrivateConversation(userId: string, dto: CreateConversationDto) {
    const recipientId = dto.recipientId.trim();

    if (!recipientId) {
      throw new BadRequestException('Le destinataire est obligatoire');
    }

    if (recipientId === userId) {
      throw new BadRequestException(
        'Une conversation privée doit avoir un autre utilisateur',
      );
    }

    await this.assertUserCanChat(recipientId);

    const privateKey = buildPrivateConversationKey(userId, recipientId);
    const conversation = await this.prisma.conversations.upsert({
      where: {
        private_key: privateKey,
      },
      update: {},
      create: {
        type: 'private',
        private_key: privateKey,
        created_by: userId,
        participants: {
          create: [userId, recipientId].map((participantId, index) => ({
            user_id: participantId,
            role: index === 0 ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: this.getConversationDetailInclude(userId),
    });

    return this.formatConversationDetail(conversation, userId);
  }

  async createGroupConversation(
    userId: string,
    dto: CreateGroupConversationDto,
  ) {
    const title = normalizeConversationTitle(dto.title);
    assertValidGroupTitle(title);

    const participantIds = normalizeUserIds(dto.participantIds).filter(
      (participantId) => participantId !== userId,
    );

    if (participantIds.length === 0) {
      throw new BadRequestException(
        'Ajoute au moins un utilisateur pour créer un groupe',
      );
    }

    await Promise.all(
      participantIds.map((participantId) =>
        this.assertUserCanChat(participantId),
      ),
    );

    const conversation = await this.prisma.conversations.create({
      data: {
        type: 'group',
        title,
        created_by: userId,
        participants: {
          create: [userId, ...participantIds].map((participantId, index) => ({
            user_id: participantId,
            role: index === 0 ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: this.getConversationDetailInclude(userId),
    });

    return this.formatConversationDetail(conversation, userId);
  }

  async getMyConversations(userId: string) {
    await this.messagerieMuteService.cleanupExpiredMutes(userId);

    await this.prisma.messages.updateMany({
      where: {
        sender_id: {
          not: userId,
        },
        status: 'SENT',
        deleted_for_everyone_at: null,
        deleted_for_users: {
          none: {
            user_id: userId,
          },
        },
        conversation: {
          participants: {
            some: {
              user_id: userId,
            },
          },
        },
      },
      data: {
        status: 'DELIVERED',
        delivered_at: new Date(),
      },
    });

    const memberships = await this.prisma.conversation_participants.findMany({
      where: { user_id: userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: this.participantPreviewSelect,
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { created_at: 'desc' },
              where: {
                deleted_for_users: {
                  none: {
                    user_id: userId,
                  },
                },
              },
              include: {
                sender: {
                  select: this.participantPreviewSelect,
                },
                pinned_by_user: {
                  select: this.participantPreviewSelect,
                },
              },
            },
          },
        },
      },
      orderBy: {
        conversation: {
          last_message_at: 'desc',
        },
      },
    });

    return memberships.map((membership) =>
      this.formatConversationSummary(membership.conversation, userId),
    );
  }

  async getConversationById(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      include: this.getConversationDetailInclude(userId),
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    return this.formatConversationDetail(conversation, userId);
  }

  async updateConversationMute(
    conversationId: string,
    userId: string,
    dto: UpdateConversationMuteDto,
  ) {
    return this.messagerieMuteService.updateConversationMute(
      conversationId,
      userId,
      dto,
    );
  }

  async getMessages(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversations.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          participants: {
            select: {
              user_id: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation introuvable');
      }

      await tx.messages.updateMany({
        where: {
          conversation_id: conversationId,
          sender_id: {
            not: userId,
          },
          status: 'SENT',
          deleted_for_everyone_at: null,
          deleted_for_users: {
            none: {
              user_id: userId,
            },
          },
        },
        data: {
          status: 'DELIVERED',
          delivered_at: new Date(),
        },
      });

      return tx.messages.findMany({
        where: {
          conversation_id: conversationId,
          deleted_for_users: {
            none: {
              user_id: userId,
            },
          },
        },
        orderBy: { created_at: 'asc' },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
          pinned_by_user: {
            select: this.participantPreviewSelect,
          },
        },
      });
    });
  }

  async updateMessagePin(
    conversationId: string,
    messageId: string,
    userId: string,
    dto: UpdateMessagePinDto,
  ) {
    await this.assertMembership(conversationId, userId);

    const message = await this.prisma.messages.findFirst({
      where: {
        id: messageId,
        conversation_id: conversationId,
        deleted_for_everyone_at: null,
      },
      select: {
        id: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message introuvable');
    }

    return this.prisma.messages.update({
      where: { id: messageId },
      data: {
        pinned_at: dto.is_pinned ? new Date() : null,
        pinned_by: dto.is_pinned ? userId : null,
      },
      include: {
        sender: {
          select: this.participantPreviewSelect,
        },
        pinned_by_user: {
          select: this.participantPreviewSelect,
        },
      },
    });
  }

  async getTypingStatus(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    const threshold = new Date(Date.now() - this.typingWindowMs);

    const typingParticipants =
      await this.prisma.conversation_participants.findMany({
        where: {
          conversation_id: conversationId,
          user_id: {
            not: userId,
          },
          last_typing_at: {
            gte: threshold,
          },
        },
        include: {
          user: {
            select: this.participantPreviewSelect,
          },
        },
        orderBy: {
          last_typing_at: 'desc',
        },
      });

    return {
      conversationId,
      users: typingParticipants
        .map((participant) => this.mapPresenceUser(participant.user))
        .filter((user) => user !== null),
      updatedAt: new Date(),
    };
  }

  async updateTypingStatus(
    conversationId: string,
    userId: string,
    dto: UpdateTypingDto,
  ) {
    await this.assertMembership(conversationId, userId);

    const now = new Date();
    const nextTypingAt = dto.is_typing ? now : null;

    await this.prisma.conversation_participants.update({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      data: {
        last_typing_at: nextTypingAt,
      },
    });

    return {
      conversationId,
      is_typing: dto.is_typing,
      last_typing_at: nextTypingAt,
    };
  }

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        created_by: true,
        participants: {
          select: {
            user_id: true,
            role: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    const membership = conversation.participants.find(
      (participant) => participant.user_id === userId,
    );

    if (!membership) {
      throw new ForbiddenException(
        'Vous ne participez pas a cette conversation',
      );
    }

    if (conversation.type === 'private') {
      await this.prisma.conversations.delete({
        where: { id: conversationId },
      });

      return {
        deleted: true,
        scope: 'EVERYONE',
        conversationId,
      };
    }

    const isCreator = conversation.created_by === userId;
    const isAdmin = membership.role === 'ADMIN';

    if (isCreator || isAdmin) {
      await this.prisma.conversations.delete({
        where: { id: conversationId },
      });

      return {
        deleted: true,
        scope: 'EVERYONE',
        conversationId,
      };
    }

    await this.prisma.conversation_participants.delete({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
    });

    return {
      deleted: true,
      scope: 'ME',
      conversationId,
    };
  }

  async updateConversationArchive(
    conversationId: string,
    userId: string,
    dto: UpdateConversationArchiveDto,
  ) {
    await this.assertMembership(conversationId, userId);

    const archivedAt = dto.is_archived ? new Date() : null;

    await this.prisma.conversation_participants.update({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      data: {
        archived_at: archivedAt,
      },
    });

    return {
      conversationId,
      is_archived: dto.is_archived,
      archived_at: archivedAt,
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: CreateMessageDto,
  ) {
    await this.assertMembership(conversationId, senderId);

    const content = normalizeMessageContent(dto.content);
    const media = normalizeMediaUrls(dto.media);

    assertPrivateMessagePayload(dto.type, content, media);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.messages.create({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          type: dto.type,
          status: 'SENT',
          content,
          media: media ?? undefined,
        },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
          pinned_by_user: {
            select: this.participantPreviewSelect,
          },
        },
      });

      await tx.conversations.update({
        where: { id: conversationId },
        data: { last_message_at: now },
      });

      await tx.conversation_participants.update({
        where: {
          conversation_id_user_id: {
            conversation_id: conversationId,
            user_id: senderId,
          },
        },
        data: {
          last_typing_at: null,
        },
      });

      return createdMessage;
    });
  }

  async updateMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ) {
    await this.assertMembership(conversationId, userId);

    const message = await this.prisma.messages.findFirst({
      where: {
        id: messageId,
        conversation_id: conversationId,
        deleted_for_everyone_at: null,
      },
      include: {
        sender: {
          select: this.participantPreviewSelect,
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message introuvable');
    }

    if (message.sender_id !== userId) {
      throw new ForbiddenException("Seul l'auteur peut modifier ce message");
    }

    const nextType = dto.type ?? message.type;
    const nextContent =
      dto.content !== undefined
        ? normalizeMessageContent(dto.content)
        : normalizeMessageContent(message.content ?? undefined);

    const existingMedia = this.parseMediaFromMessage(message.media);
    const nextMedia =
      dto.media !== undefined ? normalizeMediaUrls(dto.media) : existingMedia;

    assertPrivateMessagePayload(nextType, nextContent, nextMedia ?? null);

    return this.prisma.messages.update({
      where: { id: messageId },
      data: {
        type: nextType,
        content: nextContent,
        media: nextMedia ?? Prisma.JsonNull,
        edited_at: new Date(),
      },
      include: {
        sender: {
          select: this.participantPreviewSelect,
        },
        pinned_by_user: {
          select: this.participantPreviewSelect,
        },
      },
    });
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    dto: DeleteMessageDto,
  ) {
    await this.assertMembership(conversationId, userId);

    const message = await this.prisma.messages.findFirst({
      where: {
        id: messageId,
        conversation_id: conversationId,
      },
      include: {
        sender: {
          select: this.participantPreviewSelect,
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message introuvable');
    }

    if (dto.scope === DeleteMessageScope.EVERYONE) {
      if (message.sender_id !== userId) {
        throw new ForbiddenException(
          "Seul l'auteur peut supprimer pour tout le monde",
        );
      }

      return this.prisma.messages.update({
        where: { id: messageId },
        data: {
          content: 'Message supprimé',
          media: Prisma.JsonNull,
          edited_at: new Date(),
          pinned_at: null,
          pinned_by: null,
          deleted_for_everyone_at: new Date(),
          deleted_for_everyone_by: userId,
        },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
          pinned_by_user: {
            select: this.participantPreviewSelect,
          },
        },
      });
    }

    await this.prisma.message_deleted_for_users.upsert({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId,
        },
      },
      update: {
        deleted_at: new Date(),
      },
      create: {
        message_id: messageId,
        user_id: userId,
      },
    });

    return {
      success: true,
      scope: DeleteMessageScope.ME,
      messageId,
    };
  }

  async markConversationAsRead(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversations.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          participants: {
            select: {
              user_id: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation introuvable');
      }

      await tx.messages.updateMany({
        where: {
          conversation_id: conversationId,
          sender_id: {
            not: userId,
          },
          status: 'DELIVERED',
          deleted_for_everyone_at: null,
          deleted_for_users: {
            none: {
              user_id: userId,
            },
          },
        },
        data: {
          status: 'READ',
          read_at: now,
          delivered_at: now,
        },
      });

      await tx.conversation_participants.update({
        where: {
          conversation_id_user_id: {
            conversation_id: conversationId,
            user_id: userId,
          },
        },
        data: {
          last_read_at: now,
        },
      });

      return {
        conversationId,
        lastReadAt: now,
      };
    });
  }

  async renameGroupConversation(
    conversationId: string,
    userId: string,
    dto: UpdateConversationTitleDto,
  ) {
    await this.assertGroupAdmin(conversationId, userId);

    const title = normalizeConversationTitle(dto.title);
    assertValidGroupTitle(title);

    const conversation = await this.prisma.conversations.update({
      where: { id: conversationId },
      data: { title },
      include: this.getConversationDetailInclude(userId),
    });

    return this.formatConversationDetail(conversation, userId);
  }

  async addGroupMembers(
    conversationId: string,
    userId: string,
    dto: UpdateConversationMembersDto,
  ) {
    await this.assertGroupAdmin(conversationId, userId);

    const memberIds = normalizeUserIds(dto.userIds).filter(
      (memberId) => memberId !== userId,
    );

    if (memberIds.length === 0) {
      throw new BadRequestException('Aucun utilisateur a ajouter');
    }

    await Promise.all(
      memberIds.map((memberId) => this.assertUserCanChat(memberId)),
    );

    await this.prisma.conversation_participants.createMany({
      data: memberIds.map((memberId) => ({
        conversation_id: conversationId,
        user_id: memberId,
        role: 'MEMBER',
      })),
      skipDuplicates: true,
    });

    return this.getConversationById(conversationId, userId);
  }

  async removeGroupMember(
    conversationId: string,
    userId: string,
    memberUserId: string,
  ) {
    await this.assertGroupAdmin(conversationId, userId);

    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      select: { created_by: true, type: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    if (conversation.type !== 'group') {
      throw new BadRequestException('Cette action est réservée aux groupes');
    }

    if (memberUserId === conversation.created_by) {
      throw new BadRequestException('Le créateur ne peut pas être supprimé');
    }

    await this.prisma.conversation_participants.delete({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: memberUserId,
        },
      },
    });

    return this.getConversationById(conversationId, userId);
  }

  private async assertMembership(conversationId: string, userId: string) {
    const membership = await this.prisma.conversation_participants.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Vous ne participez pas a cette conversation',
      );
    }
  }

  private async assertGroupAdmin(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        created_by: true,
        participants: {
          where: { user_id: userId },
          select: { role: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    if (conversation.type !== 'group') {
      throw new BadRequestException('Cette action est réservée aux groupes');
    }

    const currentRole = conversation.participants[0]?.role;
    const isAdmin =
      conversation.created_by === userId || currentRole === 'ADMIN';

    if (!isAdmin) {
      throw new ForbiddenException(
        'Seul le créateur du groupe peut faire cette action',
      );
    }
  }

  private async assertUserCanChat(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, compte_actif: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (user.compte_actif === false) {
      throw new BadRequestException(
        'Cet utilisateur ne peut pas recevoir de messages',
      );
    }
  }

  private getConversationDetailInclude(currentUserId?: string) {
    return {
      participants: {
        include: {
          user: {
            select: this.participantPreviewSelect,
          },
        },
      },
      messages: {
        where: currentUserId
          ? {
              deleted_for_users: {
                none: {
                  user_id: currentUserId,
                },
              },
            }
          : undefined,
        orderBy: { created_at: 'asc' as const },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
          pinned_by_user: {
            select: this.participantPreviewSelect,
          },
        },
      },
    } as const;
  }

  private parseMediaFromMessage(media: Prisma.JsonValue | null) {
    if (!Array.isArray(media)) {
      return undefined;
    }

    const normalized = media.filter(
      (item): item is string => typeof item === 'string',
    );

    return normalized.length > 0 ? normalized : undefined;
  }

  private formatConversationSummary(
    conversation: Prisma.conversationsGetPayload<{
      include: ReturnType<MessagerieService['getConversationDetailInclude']>;
    }>,
    currentUserId: string,
  ) {
    const counterpart =
      conversation.type === 'private'
        ? conversation.participants.find(
            (participant) => participant.user_id !== currentUserId,
          )
        : null;

    const currentParticipant = conversation.participants.find(
      (participant) => participant.user_id === currentUserId,
    );

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      created_by: conversation.created_by,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at,
      participant_count: conversation.participants.length,
      current_user_role: currentParticipant?.role ?? null,
      current_user_archived_at: currentParticipant?.archived_at ?? null,
      current_user_muted_at: currentParticipant?.muted_at ?? null,
      current_user_muted_until: currentParticipant?.muted_until ?? null,
      current_user_is_muted:
        this.messagerieMuteService.isMuteActive(currentParticipant),
      counterpart: this.mapPresenceUser(counterpart?.user),
      last_message: conversation.messages[0] ?? null,
    };
  }

  private formatConversationDetail(
    conversation: Prisma.conversationsGetPayload<{
      include: ReturnType<MessagerieService['getConversationDetailInclude']>;
    }>,
    currentUserId: string,
  ) {
    const counterpart =
      conversation.type === 'private'
        ? conversation.participants.find(
            (participant) => participant.user_id !== currentUserId,
          )
        : null;

    const currentParticipant = conversation.participants.find(
      (participant) => participant.user_id === currentUserId,
    );

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      created_by: conversation.created_by,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at,
      participant_count: conversation.participants.length,
      current_user_role: currentParticipant?.role ?? null,
      current_user_archived_at: currentParticipant?.archived_at ?? null,
      current_user_muted_at: currentParticipant?.muted_at ?? null,
      current_user_muted_until: currentParticipant?.muted_until ?? null,
      current_user_is_muted:
        this.messagerieMuteService.isMuteActive(currentParticipant),
      counterpart: this.mapPresenceUser(counterpart?.user),
      participants: conversation.participants.map((participant) => ({
        ...participant,
        archived_at: participant.archived_at,
        muted_at: participant.muted_at,
        muted_until: participant.muted_until,
        user: this.mapPresenceUser(participant.user),
      })),
      messages: conversation.messages,
    };
  }

  private mapPresenceUser(
    user:
      | {
          id: string;
          nom: string;
          prenom: string;
          photo_profil_url: string | null;
          is_online: boolean | null;
          last_seen_at: Date | null;
        }
      | null
      | undefined,
  ) {
    if (!user) {
      return null;
    }

    const hasRecentActivity =
      user.last_seen_at !== null &&
      Date.now() - user.last_seen_at.getTime() <= this.onlineWindowMs;

    return {
      ...user,
      is_online: Boolean(user.is_online) && hasRecentActivity,
    };
  }
}
