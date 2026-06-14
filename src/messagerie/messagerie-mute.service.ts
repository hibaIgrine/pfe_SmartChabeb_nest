/**
 * ============================================================
 * FICHIER : messagerie-mute.service.ts
 * RÔLE    : Gestion de la mise en sourdine des conversations.
 * ============================================================
 *
 * CONCEPT :
 *   Un participant peut mettre en sourdine une conversation pour ne plus
 *   recevoir de notifications de nouveaux messages. Deux modes sont supportés :
 *     - "1H"               : sourdine temporaire (muted_until = now + 1h)
 *     - "UNTIL_REACTIVATED": sourdine permanente (muted_until = null)
 *   Désactiver (is_muted=false) remet muted_at et muted_until à null.
 *
 * CHAMPS BDD (conversation_participants) :
 *   muted_at    — date d'activation de la sourdine (null = non muté)
 *   muted_until — date d'expiration (null = sourdine permanente)
 *
 * MÉTHODES :
 *
 *   updateConversationMute(conversationId, userId, dto)
 *     Vérifie la participation (ForbiddenException sinon).
 *     Calcule muted_at / muted_until selon dto.is_muted et dto.mode.
 *     Met à jour conversation_participants. Retourne l'état de mute.
 *
 *   cleanupExpiredMutes(userId)
 *     Appelée lors de getMyConversations() pour nettoyer les sourdines "1H" expirées.
 *     updateMany({ muted_until: { not: null, lte: now } }) → remet muted_at/muted_until à null.
 *
 *   isMuteActive(participant?) → boolean
 *     Fonction utilitaire synchrone (pas de BDD).
 *     Retourne true si muted_at != null ET (muted_until == null OU muted_until > now).
 *     Utilisée dans les formatters de formatConversationSummary / formatConversationDetail.
 */

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
