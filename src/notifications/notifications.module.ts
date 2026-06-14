/**
 * ============================================================
 * FICHIER : notifications.module.ts
 * RÔLE    : Module de gestion des notifications in-app utilisateur.
 * ============================================================
 *
 * CONCEPT :
 *   Les notifications sont des messages persistants en BDD destinés à un
 *   utilisateur spécifique. Elles informent d'un événement survenu dans le
 *   système (décision d'adhésion, réservation, événement, tâche, post...).
 *
 * TABLE PRISMA : notifications
 *   Champs : id, id_utilisateur, type, titre, message, data (JSON), is_read, created_at
 *
 * TYPES DE NOTIFICATIONS (champ `type`) :
 *   Adhésion     : ADHESION_ACCEPTED | ADHESION_REJECTED
 *   Réservation  : RESERVATION_ACCEPTED | RESERVATION_REJECTED
 *   Événement    : EVENT_PARTICIPATION_CONFIRMED | EVENT_PARTICIPATION_REFUSED
 *                  EVENT_UPDATED | EVENT_CANCELLED | EVENT_REMINDER
 *   Points       : POINTS_EARNED
 *   Club         : CLUB_CREATION_ACCEPTED | CLUB_CREATION_REJECTED
 *   Tâches       : TASK_ASSIGNED | TASK_UPDATED | TASK_COMPLETED | TASK_REMINDER
 *   Posts        : POST_REACTION | POST_COMMENT | POST_COMMENT_REPLY
 *                  POST_MENTION | POST_COMMENT_MENTION
 *
 * RAPPELS AUTOMATIQUES (lazy) :
 *   getMyNotifications() et getMyUnreadCount() déclenchent AUSSI la création
 *   de rappels EVENT_REMINDER et TASK_REMINDER pour les 24h à venir.
 *   Ces rappels sont idempotents (on vérifie l'existence avant création).
 *
 * EXPORTS :
 *   NotificationsService → utilisé par d'autres modules pour envoyer des
 *   notifications : EventsModule, ReservationsModule, ClubsModule,
 *   PostsModule, ClubTasksModule, EventRequestCreationsModule...
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // Injecté dans les autres modules pour envoyer des notifications
})
export class NotificationsModule {}
