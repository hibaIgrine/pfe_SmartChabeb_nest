import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateConversationMuteDto } from './dto/update-conversation-mute.dto';

@Injectable()
export class MessagerieMuteService {
  constructor(private readonly prisma: PrismaService) {}

  async updateConversationMute(
    conversationId: string,
    userId: string,
    dto: UpdateConversationMuteDto,
  ) {
    const membership = await this.prisma.conversation_participants.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Vous ne participez pas a cette conversation',
      );
    }

    const mutedAt = dto.is_muted ? new Date() : null;
    const mutedUntil = dto.is_muted
      ? dto.mode === '1H'
        ? new Date(Date.now() + 60 * 60 * 1000)
        : null
      : null;

    await this.prisma.conversation_participants.update({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      data: {
        muted_at: mutedAt,
        muted_until: mutedUntil,
      },
    });

    return {
      conversationId,
      is_muted: dto.is_muted,
      muted_at: mutedAt,
      muted_until: mutedUntil,
      mode: dto.mode ?? null,
    };
  }

  async cleanupExpiredMutes(userId: string) {
    await this.prisma.conversation_participants.updateMany({
      where: {
        user_id: userId,
        muted_until: {
          not: null,
          lte: new Date(),
        },
      },
      data: {
        muted_at: null,
        muted_until: null,
      },
    });
  }

  isMuteActive(participant?: {
    muted_at?: Date | null;
    muted_until?: Date | null;
  }) {
    if (!participant) {
      return false;
    }

    if (!participant.muted_at) {
      return false;
    }

    if (!participant.muted_until) {
      return true;
    }

    return participant.muted_until.getTime() > Date.now();
  }
}
