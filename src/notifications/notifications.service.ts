/**
 * ============================================================
 * FICHIER : notifications.service.ts
 * RÔLE    : Création et gestion des notifications in-app pour les utilisateurs.
 * ============================================================
 *
 * ARCHITECTURE :
 *   Ce service est un "producteur" de notifications. Il est injecté dans tous
 *   les modules qui ont besoin d'envoyer des notifications (Events, Reservations,
 *   Clubs, Posts, ClubTasks, EventRequestCreations).
 *   Le controller ne crée jamais de notifications — il ne fait que les lire.
 *
 * TYPES TYPESCRIPT (payloads internes) :
 *   Chaque méthode de création accepte un payload typé (non exposé en HTTP) :
 *   - MembershipDecisionPayload      → adhésion acceptée/refusée
 *   - ReservationDecisionPayload     → réservation validée/refusée
 *   - EventParticipationDecisionPayload → inscription confirmée/refusée
 *   - EventUpdatePayload             → événement modifié (changes: string[])
 *   - EventCancellationPayload       → événement annulé
 *   - PointsEarnedPayload            → points gagnés lors d'un check-in
 *   - ClubCreationDecisionPayload    → demande de club acceptée/refusée
 *   - ClubTaskNotificationPayload    → tâche assignée/mise à jour/complétée/rappel
 *   - PostReactionNotificationPayload   → réaction sur un post
 *   - PostCommentNotificationPayload    → commentaire sur un post
 *   - PostCommentReplyNotificationPayload → réponse à un commentaire
 *   - PostMentionNotificationPayload    → mention dans un post
 *   - PostCommentMentionNotificationPayload → mention dans un commentaire
 *
 * MÉTHODES DE CRÉATION (publiques, appelées par les autres services) :
 *   createMembershipDecisionNotification     → ADHESION_ACCEPTED | ADHESION_REJECTED
 *   createReservationDecisionNotification    → RESERVATION_ACCEPTED | RESERVATION_REJECTED
 *   createEventParticipationDecisionNotification → EVENT_PARTICIPATION_CONFIRMED | EVENT_PARTICIPATION_REFUSED
 *   createEventUpdateNotification            → EVENT_UPDATED (changes[] joint par ", ")
 *   createEventCancellationNotification      → EVENT_CANCELLED
 *   createPointsEarnedNotification           → POINTS_EARNED
 *   createClubCreationDecisionNotification   → CLUB_CREATION_ACCEPTED | CLUB_CREATION_REJECTED
 *   createClubTaskNotification               → TASK_ASSIGNED | TASK_UPDATED | TASK_COMPLETED | TASK_REMINDER
 *   createPostCommentNotification            → POST_COMMENT
 *   createPostCommentReplyNotification       → POST_COMMENT_REPLY
 *   createPostReactionNotification           → POST_REACTION
 *   createPostMentionNotification            → POST_MENTION
 *   createPostCommentMentionNotification     → POST_COMMENT_MENTION
 *
 * MÉTHODES DE LECTURE (publiques, appelées par le controller) :
 *   getMyNotifications(userId, limit)   → findMany triées par created_at DESC, limit clampé 1-100
 *                                         DÉCLENCHE AUSSI les rappels lazy 24h
 *   getMyUnreadCount(userId)            → count WHERE is_read=false
 *                                         DÉCLENCHE AUSSI les rappels lazy 24h
 *   markAsRead(userId, notificationId)  → updateMany WHERE id + id_utilisateur → is_read=true
 *   markAllAsRead(userId)               → updateMany WHERE id_utilisateur + is_read=false
 *
 * RAPPELS AUTOMATIQUES LAZY (méthodes privées) :
 *   createUpcomingEventReminders(userId)
 *     → Cherche les participations CONFIRME à des événements actifs dans les 24h.
 *     → Crée une notif EVENT_REMINDER par événement (idempotent : vérifie
 *       l'existence via data.path['eventId'] avant création).
 *     → Max 20 rappels par appel (take: 20).
 *
 *   createUpcomingTaskReminders(userId)
 *     → Cherche les tâches (créées ou affectées) avec date_limite dans les 24h,
 *       statut EN_ATTENTE | EN_COURS | A_FAIRE.
 *     → Crée une notif TASK_REMINDER par tâche (idempotent : vérifie data.path['taskId']).
 *     → Max 20 rappels par appel (take: 20).
 *
 * UTILITAIRES PRIVÉS :
 *   formatDate(date) → toLocaleDateString('fr-FR', {day,month,year,UTC}) → "15/01/2024"
 *   formatTime(date) → toLocaleTimeString('fr-FR', {hour,minute,hour12:false,UTC}) → "09:30"
 *
 * CHAMP `data` :
 *   JSON stocké en BDD. Contient les métadonnées propres à chaque type de notification
 *   (ex: eventId, clubNom, reservationId...) pour que le front-end puisse construire
 *   des liens de navigation vers la ressource concernée.
 */

import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/** Payload pour notifier une décision d'adhésion à un club (acceptée ou refusée) */
type MembershipDecisionPayload = {
  utilisateurId: string;
  clubId: string;
  clubNom: string;
  inscriptionId: string;
  statut: 'ACCEPTE' | 'REFUSE';
  responsableId?: string;
};

/** Payload pour notifier une décision de réservation de local (validée ou refusée) */
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

/** Payload pour notifier une décision de participation à un événement (confirmée ou refusée) */
type EventParticipationDecisionPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId?: string | null;
  clubNom?: string | null;
  dateEvent: Date;
  startTime: Date;
  endTime: Date;
  statut: 'CONFIRME' | 'REFUSE';
  responsableId?: string;
};

/** Payload pour notifier une modification d'événement — changes[] liste les champs modifiés */
type EventUpdatePayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId?: string | null;
  clubNom?: string | null;
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

/** Payload pour notifier l'annulation d'un événement auquel le participant était inscrit */
type EventCancellationPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  clubId?: string | null;
  clubNom?: string | null;
  localNom: string;
  dateEvent: Date;
  startTime: Date;
  endTime: Date;
  responsableId?: string;
};

/** Payload pour notifier l'attribution de points suite à un check-in événement */
type PointsEarnedPayload = {
  utilisateurId: string;
  eventId: string;
  eventNom: string;
  points: number;
};

/** Payload pour notifier une décision sur une demande de création de club */
type ClubCreationDecisionPayload = {
  utilisateurId: string;
  demandeId: string;
  clubNom: string;
  statut: 'ACCEPTEE' | 'REFUSEE';
  commentaireDecision?: string | null;
  reviewedBy?: string;
};

/** Payload générique pour les notifications de tâches de club (assignation, mise à jour, complétion, rappel) */
type ClubTaskNotificationPayload = {
  utilisateurId: string;
  type: 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'TASK_COMPLETED' | 'TASK_REMINDER';
  titre: string;
  message: string;
  data?: Record<string, unknown>;
};

/** Payload pour notifier l'auteur d'un post qu'un utilisateur a réagi à sa publication */
type PostReactionNotificationPayload = {
  utilisateurId: string;
  postId: string;
  reactorId: string;
  reactorNomComplet: string;
  reactionType: string;
  reactionLabel: string;
};

/** Payload pour notifier l'auteur d'un post qu'un utilisateur a commenté sa publication */
type PostCommentNotificationPayload = {
  utilisateurId: string;
  postId: string;
  commentId: string;
  commenterId: string;
  commenterNomComplet: string;
};

/** Payload pour notifier l'auteur d'un commentaire qu'une réponse lui a été faite */
type PostCommentReplyNotificationPayload = {
  utilisateurId: string;
  postId: string;
  commentId: string;
  parentCommentId: string;
  replierId: string;
  replierNomComplet: string;
};

/** Payload pour notifier un utilisateur qu'il a été mentionné dans un post */
type PostMentionNotificationPayload = {
  utilisateurId: string;
  postId: string;
  auteurId: string;
  auteurNomComplet: string;
};

/** Payload pour notifier un utilisateur qu'il a été mentionné dans un commentaire */
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

  /** Notif tâche générique — type passé directement dans le payload (TASK_ASSIGNED, TASK_UPDATED, TASK_COMPLETED, TASK_REMINDER). */
  async createClubTaskNotification(payload: ClubTaskNotificationPayload) {
    return this.prisma.notifications.create({
      data: {
        id_utilisateur: payload.utilisateurId,
        type: payload.type,
        titre: payload.titre,
        message: payload.message,
        data: payload.data as Prisma.InputJsonValue | undefined,
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

  /** POST_COMMENT — notifie l'auteur du post qu'un commentaire a été posté. */
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

  /** POST_COMMENT_REPLY — notifie l'auteur du commentaire parent qu'une réponse lui a été faite. */
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

  /** POST_REACTION — notifie l'auteur du post qu'un utilisateur a réagi (reactionLabel dans le message). */
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

  /** POST_MENTION — notifie l'utilisateur mentionné dans un post (@mention). */
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

  /** POST_COMMENT_MENTION — notifie l'utilisateur mentionné dans un commentaire (@mention). */
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

  /** CLUB_CREATION_ACCEPTED / CLUB_CREATION_REJECTED — notifie le demandeur de la décision sur sa demande de club. */
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

  /**
   * Crée des rappels EVENT_REMINDER pour les événements dans les 24h à venir.
   * Idempotent : vérifie l'existence via data->>'eventId' avant toute création.
   * Appelé de manière lazy par getMyNotifications() et getMyUnreadCount().
   */
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
      const clubLabel = event.club?.nom ? ` (${event.club.nom})` : '';

      await this.prisma.notifications.create({
        data: {
          id_utilisateur: utilisateurId,
          type: 'EVENT_REMINDER',
          titre: 'Rappel evenement',
          message: `Rappel: votre evenement ${event.nom}${clubLabel} commence le ${dateLabel} de ${startLabel} a ${endLabel}.`,
          data: {
            eventId: event.id,
            eventNom: event.nom,
            clubId: event.club?.id,
            clubNom: event.club?.nom,
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

  /**
   * Crée des rappels TASK_REMINDER pour les tâches (créées ou affectées) dans les 24h.
   * Statuts ciblés : EN_ATTENTE | EN_COURS | A_FAIRE. Idempotent via data->>'taskId'.
   * Appelé de manière lazy par getMyNotifications() et getMyUnreadCount().
   */
  private async createUpcomingTaskReminders(utilisateurId: string) {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingTasks = await this.prisma.club_taches.findMany({
      where: {
        date_limite: {
          gt: now,
          lte: next24Hours,
        },
        statut: {
          in: ['EN_ATTENTE', 'EN_COURS', 'A_FAIRE'],
        },
        OR: [
          { id_createur: utilisateurId },
          {
            affectations: {
              some: { id_utilisateur: utilisateurId },
            },
          },
        ],
      },
      select: {
        id: true,
        titre: true,
        date_limite: true,
        club: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
      orderBy: {
        date_limite: 'asc',
      },
      take: 20,
    });

    for (const task of upcomingTasks) {
      const existingReminder = await this.prisma.notifications.findFirst({
        where: {
          id_utilisateur: utilisateurId,
          type: 'TASK_REMINDER',
          data: {
            path: ['taskId'],
            equals: task.id,
          },
        },
        select: { id: true },
      });

      if (existingReminder) {
        continue;
      }

      const dateLabel = this.formatDate(task.date_limite);
      const timeLabel = this.formatTime(task.date_limite);

      await this.prisma.notifications.create({
        data: {
          id_utilisateur: utilisateurId,
          type: 'TASK_REMINDER',
          titre: 'Echeance de tache proche',
          message: `Rappel: la tache ${task.titre}${task.club?.nom ? ` (${task.club.nom})` : ''} arrive a echeance le ${dateLabel} a ${timeLabel}.`,
          data: {
            taskId: task.id,
            taskTitle: task.titre,
            clubId: task.club?.id,
            clubNom: task.club?.nom,
            dateLimite: task.date_limite.toISOString(),
            reminderWindow: '24H',
          },
        },
      });
    }
  }

  /** Formate une date en heure "HH:MM" (locale fr-FR, fuseau UTC). Ex: "09:30" */
  private formatTime(date: Date) {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
  }

  /** Formate une date en "JJ/MM/AAAA" (locale fr-FR, fuseau UTC). Ex: "15/01/2024" */
  private formatDate(date: Date) {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  /** ADHESION_ACCEPTED / ADHESION_REJECTED — notifie le demandeur de la décision d'adhésion à un club. */
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

  /**
   * RESERVATION_ACCEPTED / RESERVATION_REJECTED — notifie le demandeur de la décision.
   * Si VALIDEE, le message invite à procéder au paiement pour finaliser la réservation.
   */
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
          ? `Votre reservation de ${payload.localNom} le ${dateLabel} (${startLabel}-${endLabel}) a ete confirmee. Vous pouvez maintenant procéder au paiement pour finaliser votre réservation.`
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

  /** EVENT_PARTICIPATION_CONFIRMED / EVENT_PARTICIPATION_REFUSED — notifie le participant de la décision. */
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

  /**
   * EVENT_UPDATED — notifie les participants CONFIRME/EN_ATTENTE d'une modification.
   * changes[] liste les champs modifiés (ex: ['date', 'heure']) — joint par ", " dans le message.
   * dateEventText/startTimeText/endTimeText permettent d'injecter un texte pré-formaté.
   */
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

  /** EVENT_CANCELLED — notifie les participants CONFIRME/EN_ATTENTE de l'annulation de l'événement. */
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

  /** POINTS_EARNED — notifie l'utilisateur du nombre de points gagnés lors du check-in événement. */
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

  /**
   * Retourne les notifications de l'utilisateur (triées created_at DESC, limit clampé 1-100).
   * EFFET DE BORD LAZY : déclenche la création des rappels EVENT_REMINDER et TASK_REMINDER des 24h.
   */
  async getMyNotifications(utilisateurId: string, limit = 20) {
    await this.createUpcomingEventReminders(utilisateurId);
    await this.createUpcomingTaskReminders(utilisateurId);

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

  /**
   * Retourne { count: N } — nombre de notifications non lues.
   * EFFET DE BORD LAZY : déclenche la création des rappels 24h (même chose que getMyNotifications).
   */
  async getMyUnreadCount(utilisateurId: string) {
    await this.createUpcomingEventReminders(utilisateurId);
    await this.createUpcomingTaskReminders(utilisateurId);

    const count = await this.prisma.notifications.count({
      where: { id_utilisateur: utilisateurId, is_read: false },
    });

    return { count };
  }

  /**
   * Marque une notification comme lue. updateMany filtre sur (id + id_utilisateur)
   * pour qu'un utilisateur ne puisse pas marquer les notifications d'un autre.
   */
  async markAsRead(utilisateurId: string, notificationId: string) {
    await this.prisma.notifications.updateMany({
      where: { id: notificationId, id_utilisateur: utilisateurId },
      data: { is_read: true },
    });

    return { success: true };
  }

  /** Marque toutes les notifications non lues de l'utilisateur comme lues (updateMany WHERE is_read=false). */
  async markAllAsRead(utilisateurId: string) {
    await this.prisma.notifications.updateMany({
      where: { id_utilisateur: utilisateurId, is_read: false },
      data: { is_read: true },
    });

    return { success: true };
  }
}
