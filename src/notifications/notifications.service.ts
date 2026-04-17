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

type EventParticipationDecisionPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId: string;
  clubNom: string;
  dateEvent: Date;
  startTime: Date;
  endTime: Date;
  statut: 'CONFIRME' | 'REFUSE';
  responsableId?: string;
};

type EventUpdatePayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId: string;
  clubNom: string;
  localNom: string;
  dateEvent: Date;
  startTime: Date;
  endTime: Date;
  dateEventText?: string;
  startTimeText?: string;
  endTimeText?: string;
  changes: string[];
  responsableId?: string;
};

type EventCancellationPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId: string;
  clubNom: string;
  localNom: string;
  dateEvent: Date;
  startTime: Date;
  endTime: Date;
  responsableId?: string;
};

type PointsEarnedPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  points: number;
};

type ClubCreationDecisionPayload = {
  utilisateurId: string;
  demandeId: string;
  clubNom: string;
  statut: 'ACCEPTEE' | 'REFUSEE';
  commentaireDecision?: string | null;
  reviewedBy?: string;
};

type PostReactionNotificationPayload = {
  utilisateurId: string;
  postId: string;
  reactorId: string;
  reactorNomComplet: string;
  reactionType: string;
  reactionLabel: string;
};

type PostCommentNotificationPayload = {
  utilisateurId: string;
  postId: string;
  commentId: string;
  commenterId: string;
  commenterNomComplet: string;
};

type PostCommentReplyNotificationPayload = {
  utilisateurId: string;
  postId: string;
  commentId: string;
  parentCommentId: string;
  replierId: string;
  replierNomComplet: string;
};

type PostMentionNotificationPayload = {
  utilisateurId: string;
  postId: string;
  auteurId: string;
  auteurNomComplet: string;
};

type PostCommentMentionNotificationPayload = {
  utilisateurId: string;
  postId: string;
  commentId: string;
  commenterId: string;
  commenterNomComplet: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPostCommentNotification(payload: PostCommentNotificationPayload) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POST_COMMENT',
        titre: 'Nouveau commentaire',
        message: `${payload.commenterNomComplet} a commente votre publication.`,
        data: {
          postId: payload.postId,
          commentId: payload.commentId,
          commenterId: payload.commenterId,
          commenterNomComplet: payload.commenterNomComplet,
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

  async createPostCommentReplyNotification(
    payload: PostCommentReplyNotificationPayload,
  ) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POST_COMMENT_REPLY',
        titre: 'Nouvelle reponse',
        message: `${payload.replierNomComplet} a repondu a votre commentaire.`,
        data: {
          postId: payload.postId,
          commentId: payload.commentId,
          parentCommentId: payload.parentCommentId,
          replierId: payload.replierId,
          replierNomComplet: payload.replierNomComplet,
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

  async createPostReactionNotification(
    payload: PostReactionNotificationPayload,
  ) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POST_REACTION',
        titre: 'Nouvelle reaction',
        message: `${payload.reactorNomComplet} a reagi (${payload.reactionLabel}) a votre publication.`,
        data: {
          postId: payload.postId,
          reactorId: payload.reactorId,
          reactorNomComplet: payload.reactorNomComplet,
          reactionType: payload.reactionType,
          reactionLabel: payload.reactionLabel,
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

  async createPostMentionNotification(payload: PostMentionNotificationPayload) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POST_MENTION',
        titre: 'Vous avez ete mentionne',
        message: `${payload.auteurNomComplet} vous a mentionne dans une publication.`,
        data: {
          postId: payload.postId,
          auteurId: payload.auteurId,
          auteurNomComplet: payload.auteurNomComplet,
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

  async createPostCommentMentionNotification(
    payload: PostCommentMentionNotificationPayload,
  ) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POST_COMMENT_MENTION',
        titre: 'Vous avez ete mentionne',
        message: `${payload.commenterNomComplet} vous a mentionne dans un commentaire.`,
        data: {
          postId: payload.postId,
          commentId: payload.commentId,
          commenterId: payload.commenterId,
          commenterNomComplet: payload.commenterNomComplet,
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

  async createClubCreationDecisionNotification(
    payload: ClubCreationDecisionPayload,
  ) {
    const isAccepted = payload.statut === 'ACCEPTEE';

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: isAccepted ? 'CLUB_CREATION_ACCEPTED' : 'CLUB_CREATION_REJECTED',
        titre: isAccepted ? 'Demande club acceptee' : 'Demande club refusee',
        message: isAccepted
          ? `Votre demande de creation du club ${payload.clubNom} a ete acceptee.`
          : `Votre demande de creation du club ${payload.clubNom} a ete refusee.`,
        data: {
          demandeId: payload.demandeId,
          clubNom: payload.clubNom,
          statut: payload.statut,
          commentaireDecision: payload.commentaireDecision ?? null,
          reviewedBy: payload.reviewedBy ?? null,
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

  private async createUpcomingEventReminders(utilisateurId: string) {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingParticipations =
      await this.prisma.event_participants.findMany({
        where: {
          user_id: utilisateurId,
          status: 'CONFIRME',
          event: {
            is_active: true,
            start_time: {
              gt: now,
              lte: next24Hours,
            },
          },
        },
        include: {
          event: {
            select: {
              id: true,
              nom: true,
              date_event: true,
              start_time: true,
              end_time: true,
              club: { select: { id: true, nom: true } },
              local: { select: { id: true, nom: true } },
            },
          },
        },
        orderBy: { event: { start_time: 'asc' } },
        take: 20,
      });

    for (const participation of upcomingParticipations) {
      const event = participation.event;
      if (!event) continue;

      const existingReminder = await this.prisma.notifications.findFirst({
        where: {
          id_utilisateur: utilisateurId,
          type: 'EVENT_REMINDER',
          data: {
            path: ['eventId'],
            equals: event.id,
          },
        },
        select: { id: true },
      });

      if (existingReminder) continue;

      const dateLabel = this.formatDate(event.date_event);
      const startLabel = this.formatTime(event.start_time);
      const endLabel = this.formatTime(event.end_time);

      await this.prisma.notifications.create({
        data: {
          id_utilisateur: utilisateurId,
          type: 'EVENT_REMINDER',
          titre: 'Rappel evenement',
          message: `Rappel: votre evenement ${event.nom} (${event.club.nom}) commence le ${dateLabel} de ${startLabel} a ${endLabel}.`,
          data: {
            eventId: event.id,
            eventNom: event.nom,
            clubId: event.club.id,
            clubNom: event.club.nom,
            localId: event.local.id,
            localNom: event.local.nom,
            dateEvent: event.date_event.toISOString(),
            startTime: event.start_time.toISOString(),
            endTime: event.end_time.toISOString(),
            reminderWindow: '24H',
          },
        },
      });
    }
  }

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

  async createEventParticipationDecisionNotification(
    payload: EventParticipationDecisionPayload,
  ) {
    const isConfirmed = payload.statut === 'CONFIRME';
    const dateLabel = this.formatDate(payload.dateEvent);
    const startLabel = this.formatTime(payload.startTime);
    const endLabel = this.formatTime(payload.endTime);

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: isConfirmed
          ? 'EVENT_PARTICIPATION_CONFIRMED'
          : 'EVENT_PARTICIPATION_REFUSED',
        titre: isConfirmed
          ? 'Inscription evenement confirmee'
          : 'Inscription evenement refusee',
        message: isConfirmed
          ? `Votre inscription a l'evenement ${payload.eventNom} (${payload.clubNom}) le ${dateLabel} de ${startLabel} a ${endLabel} a ete confirmee.`
          : `Votre inscription a l'evenement ${payload.eventNom} (${payload.clubNom}) le ${dateLabel} de ${startLabel} a ${endLabel} a ete refusee.`,
        data: {
          eventId: payload.eventId,
          eventNom: payload.eventNom,
          clubId: payload.clubId,
          clubNom: payload.clubNom,
          dateEvent: payload.dateEvent.toISOString(),
          startTime: payload.startTime.toISOString(),
          endTime: payload.endTime.toISOString(),
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

  async createEventUpdateNotification(payload: EventUpdatePayload) {
    const dateLabel =
      payload.dateEventText ?? this.formatDate(payload.dateEvent);
    const startLabel =
      payload.startTimeText ?? this.formatTime(payload.startTime);
    const endLabel = payload.endTimeText ?? this.formatTime(payload.endTime);
    const changeLabel =
      payload.changes.length > 0
        ? payload.changes.join(', ')
        : 'les informations';

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'EVENT_UPDATED',
        titre: 'Evenement modifie',
        message: `L'evenement ${payload.eventNom} (${payload.clubNom}) a ete modifie: ${changeLabel}. Nouveaux details: ${dateLabel} de ${startLabel} a ${endLabel} au local ${payload.localNom}.`,
        data: {
          eventId: payload.eventId,
          eventNom: payload.eventNom,
          clubId: payload.clubId,
          clubNom: payload.clubNom,
          localNom: payload.localNom,
          dateEvent: payload.dateEvent.toISOString(),
          startTime: payload.startTime.toISOString(),
          endTime: payload.endTime.toISOString(),
          changes: payload.changes,
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

  async createEventCancellationNotification(payload: EventCancellationPayload) {
    const dateLabel = this.formatDate(payload.dateEvent);
    const startLabel = this.formatTime(payload.startTime);
    const endLabel = this.formatTime(payload.endTime);

    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'EVENT_CANCELLED',
        titre: 'Evenement annule',
        message: `L'evenement ${payload.eventNom} (${payload.clubNom}) prevu le ${dateLabel} de ${startLabel} a ${endLabel} au local ${payload.localNom} a ete annule.`,
        data: {
          eventId: payload.eventId,
          eventNom: payload.eventNom,
          clubId: payload.clubId,
          clubNom: payload.clubNom,
          localNom: payload.localNom,
          dateEvent: payload.dateEvent.toISOString(),
          startTime: payload.startTime.toISOString(),
          endTime: payload.endTime.toISOString(),
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

  async createPointsEarnedNotification(payload: PointsEarnedPayload) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: 'POINTS_EARNED',
        titre: 'Points gagnes',
        message: `Bravo ! Vous avez gagne ${payload.points} points pour votre participation a l'evenement ${payload.eventNom}.`,
        data: {
          eventId: payload.eventId,
          eventNom: payload.eventNom,
          points: payload.points,
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
    await this.createUpcomingEventReminders(utilisateurId);

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
    await this.createUpcomingEventReminders(utilisateurId);

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
