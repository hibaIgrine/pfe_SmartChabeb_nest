import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagerieService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(userId: string, dto: CreateConversationDto) {
    const participantIds = Array.from(
      new Set(
        (dto.participantIds ?? []).filter(
          (participantId) => participantId !== userId,
        ),
      ),
    );

    if (dto.type === 'private' && participantIds.length !== 1) {
      throw new BadRequestException(
        'Une conversation privée doit contenir exactement un autre participant',
      );
    }

    if (dto.type === 'group' && participantIds.length < 2) {
      throw new BadRequestException(
        'Une conversation de groupe doit contenir au moins deux autres participants',
      );
    }

    const conversation = await this.prisma.conversations.create({
      data: {
        type: dto.type,
        title: dto.title?.trim() || null,
        created_by: userId,
      },
    });

    await this.prisma.conversation_participants.createMany({
      data: [userId, ...participantIds].map((participantId, index) => ({
        conversation_id: conversation.id,
        user_id: participantId,
        role: index === 0 ? 'ADMIN' : 'MEMBER',
      })),
    });

    return this.getConversationById(conversation.id, userId);
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
                  select: {
                    id: true,
                    nom: true,
                    prenom: true,
                    photo_profil_url: true,
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { created_at: 'desc' },
              include: {
                sender: {
                  select: {
                    id: true,
                    nom: true,
                    prenom: true,
                    photo_profil_url: true,
                  },
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

    return memberships.map((membership) => membership.conversation);
  }

  async getConversationById(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                photo_profil_url: true,
              },
            },
          },
        },
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                photo_profil_url: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    return conversation;
  }

  async addParticipant(
    conversationId: string,
    requesterId: string,
    participantId: string,
  ) {
    await this.assertMembership(conversationId, requesterId);

    const existing = await this.prisma.conversation_participants.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: participantId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.conversation_participants.create({
      data: {
        conversation_id: conversationId,
        user_id: participantId,
      },
    });
  }

  async getMessages(conversationId: string, userId: string) {
    await this.assertMembership(conversationId, userId);

    return this.prisma.messages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
    });
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: CreateMessageDto,
  ) {
    await this.assertMembership(conversationId, senderId);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.messages.create({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          content: dto.content,
          media: dto.media?.length ? dto.media : undefined,
        },
        include: {
          sender: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              photo_profil_url: true,
            },
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
}
