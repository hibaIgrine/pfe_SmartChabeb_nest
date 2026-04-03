import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type MembershipDecisionPayload = {
  utilisateurId: string;
  clubId: string;
  clubNom: string;
  inscriptionId: string;
  statut: 'ACCEPTE' | 'REFUSE';
  responsableId?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createMembershipDecisionNotification(
    payload: MembershipDecisionPayload,
  ) {
    const isAccepted = payload.statut === 'ACCEPTE';

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: isAccepted ? 'ADHESION_ACCEPTED' : 'ADHESION_REJECTED',
        titre: isAccepted ? 'Demande acceptee' : 'Demande refusee',
        message: isAccepted
          ? `Bonne nouvelle ! Votre demande au club ${payload.clubNom} a ete acceptee.`
          : `Votre demande au club ${payload.clubNom} a ete refusee.`,
        data: {
          clubId: payload.clubId,
          clubNom: payload.clubNom,
          inscriptionId: payload.inscriptionId,
          statut: payload.statut,
          responsableId: payload.responsableId ?? null,
        },
      },
      select: {
        id: true,
        titre: true,
        message: true,
        type: true,
        is_read: true,
        created_at: true,
        data: true,
      },
    });
  }

  async getMyNotifications(utilisateurId: string, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    return this.prisma.notifications.findMany({
      where: { id_utilisateur: utilisateurId },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        titre: true,
        message: true,
        type: true,
        is_read: true,
        created_at: true,
        data: true,
      },
    });
  }

  async getMyUnreadCount(utilisateurId: string) {
    const count = await this.prisma.notifications.count({
      where: { id_utilisateur: utilisateurId, is_read: false },
    });

    return { count };
  }

  async markAsRead(utilisateurId: string, notificationId: string) {
    await this.prisma.notifications.updateMany({
      where: { id: notificationId, id_utilisateur: utilisateurId },
      data: { is_read: true },
    });

    return { success: true };
  }

  async markAllAsRead(utilisateurId: string) {
    await this.prisma.notifications.updateMany({
      where: { id_utilisateur: utilisateurId, is_read: false },
      data: { is_read: true },
    });

    return { success: true };
  }
}
