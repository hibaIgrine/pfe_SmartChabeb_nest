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

type ReservationDecisionPayload = {
  utilisateurId: string;
  reservationId: string;
  localId: string;
  localNom: string;
  dateReservation: Date;
  heureDebut: Date;
  heureFin: Date;
  statut: 'VALIDEE' | 'REFUSEE';
  adminId?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTime(date: Date) {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
  }

  private formatDate(date: Date) {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

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

  async createReservationDecisionNotification(
    payload: ReservationDecisionPayload,
  ) {
    const isAccepted = payload.statut === 'VALIDEE';
    const dateLabel = this.formatDate(payload.dateReservation);
    const startLabel = this.formatTime(payload.heureDebut);
    const endLabel = this.formatTime(payload.heureFin);

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: isAccepted ? 'RESERVATION_ACCEPTED' : 'RESERVATION_REJECTED',
        titre: isAccepted ? 'Reservation confirmee' : 'Reservation refusee',
        message: isAccepted
          ? `Votre reservation de ${payload.localNom} le ${dateLabel} (${startLabel}-${endLabel}) a ete confirmee.`
          : `Votre reservation de ${payload.localNom} le ${dateLabel} (${startLabel}-${endLabel}) a ete refusee.`,
        data: {
          reservationId: payload.reservationId,
          localId: payload.localId,
          localNom: payload.localNom,
          dateReservation: payload.dateReservation.toISOString(),
          heureDebut: payload.heureDebut.toISOString(),
          heureFin: payload.heureFin.toISOString(),
          statut: payload.statut,
          adminId: payload.adminId ?? null,
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
