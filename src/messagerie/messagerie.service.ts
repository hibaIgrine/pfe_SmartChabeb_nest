import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  assertPrivateMessagePayload,
  buildPrivateConversationKey,
  normalizeMediaUrls,
  normalizeMessageContent,
} from './messagerie.utils';

@Injectable()
export class MessagerieService {
  private readonly participantPreviewSelect = {
    id: true,
    nom: true,
    prenom: true,
    photo_profil_url: true,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

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

  async getMyConversations(userId: string) {
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

      const partnerId = conversation.participants.find(
        (participant) => participant.user_id !== userId,
      )?.user_id;

      if (partnerId) {
        await tx.messages.updateMany({
          where: {
            conversation_id: conversationId,
            sender_id: partnerId,
            status: 'SENT',
          },
          data: {
            status: 'DELIVERED',
            delivered_at: new Date(),
          },
        });
      }

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

      const partnerId = conversation.participants.find(
        (participant) => participant.user_id !== userId,
      )?.user_id;

      if (partnerId) {
        await tx.messages.updateMany({
          where: {
            conversation_id: conversationId,
            sender_id: partnerId,
            status: {
              in: ['SENT', 'DELIVERED'],
            },
          },
          data: {
            status: 'READ',
            read_at: now,
            delivered_at: now,
          },
        });
      }

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
    const counterpart = conversation.participants.find(
      (participant) => participant.user_id !== currentUserId,
    );

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      created_by: conversation.created_by,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at,
      counterpart: counterpart?.user ?? null,
      last_message: conversation.messages[0] ?? null,
    };
  }

  private formatConversationDetail(
    conversation: Prisma.conversationsGetPayload<{
      include: ReturnType<MessagerieService['getConversationDetailInclude']>;
    }>,
    currentUserId: string,
  ) {
    const counterpart = conversation.participants.find(
      (participant) => participant.user_id !== currentUserId,
    );

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      created_by: conversation.created_by,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at,
      counterpart: counterpart?.user ?? null,
      participants: conversation.participants.map((participant) => ({
        ...participant,
        user: participant.user,
      })),
      messages: conversation.messages,
    };
  }
}
