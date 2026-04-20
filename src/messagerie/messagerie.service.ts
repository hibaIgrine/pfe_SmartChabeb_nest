import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateConversationMembersDto } from './dto/update-conversation-members.dto';
import { UpdateConversationTitleDto } from './dto/update-conversation-title.dto';
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

  private readonly participantPreviewSelect = {
    id: true,
    nom: true,
    prenom: true,
    photo_profil_url: true,
    is_online: true,
    last_seen_at: true,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

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
    const count = await this.prisma.messages.count({
      where: {
        sender_id: {
          not: userId,
        },
        status: {
          in: ['SENT', 'DELIVERED'],
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
      include: this.getConversationDetailInclude(),
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
      include: this.getConversationDetailInclude(),
    });

    return this.formatConversationDetail(conversation, userId);
  }

  async getMyConversations(userId: string) {
    await this.prisma.messages.updateMany({
      where: {
        sender_id: {
          not: userId,
        },
        status: 'SENT',
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
              include: {
                sender: {
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
      include: this.getConversationDetailInclude(),
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    return this.formatConversationDetail(conversation, userId);
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
        },
        data: {
          status: 'DELIVERED',
          delivered_at: new Date(),
        },
      });

      return tx.messages.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: 'asc' },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
        },
      });
    });
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
        },
      });

      await tx.conversations.update({
        where: { id: conversationId },
        data: { last_message_at: now },
      });

      return createdMessage;
    });
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
      include: this.getConversationDetailInclude(),
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

  private getConversationDetailInclude() {
    return {
      participants: {
        include: {
          user: {
            select: this.participantPreviewSelect,
          },
        },
      },
      messages: {
        orderBy: { created_at: 'asc' as const },
        include: {
          sender: {
            select: this.participantPreviewSelect,
          },
        },
      },
    } as const;
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
      counterpart: this.mapPresenceUser(counterpart?.user),
      participants: conversation.participants.map((participant) => ({
        ...participant,
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
