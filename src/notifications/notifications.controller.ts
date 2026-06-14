/**
 * ============================================================
 * FICHIER : notifications.controller.ts
 * RÔLE    : Routes HTTP pour consulter et gérer les notifications de l'utilisateur.
 * ============================================================
 *
 * BASE URL : /notifications
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   GET /notifications/me                    [JWT requis]
 *     → Retourne les notifications de l'utilisateur connecté, triées par date DESC.
 *     → Query param : limit (défaut 20, clampé 1-100 dans le service).
 *     → EFFET DE BORD : déclenche la création lazy des rappels EVENT_REMINDER
 *       et TASK_REMINDER pour les événements/tâches dans les 24h à venir.
 *     → Retourne : [{ id, titre, message, type, is_read, created_at, data }]
 *
 *   GET /notifications/me/unread-count       [JWT requis]
 *     → Retourne le nombre de notifications non lues : { count: N }.
 *     → EFFET DE BORD : même déclenchement lazy des rappels 24h que ci-dessus.
 *     → Utile pour afficher un badge dans la barre de navigation du front-end.
 *
 *   PATCH /notifications/:id/read            [JWT requis]
 *     → Marque une notification spécifique comme lue (is_read = true).
 *     → Sécurisé : updateMany filtre sur id ET id_utilisateur (un user ne peut
 *       pas marquer les notifications d'un autre).
 *     → Retourne : { success: true }
 *
 *   PATCH /notifications/me/read-all         [JWT requis]
 *     → Marque TOUTES les notifications non lues de l'utilisateur comme lues.
 *     → updateMany WHERE id_utilisateur = userId AND is_read = false.
 *     → Retourne : { success: true }
 *
 * NOTE : La création de notifications n'est jamais déclenchée depuis ce controller.
 *   Elle est appelée en interne par les autres services (EventsService,
 *   ReservationsService, etc.) via NotificationsService injecté.
 */

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications/me
   * Notifications de l'utilisateur (triées par date DESC, limit clampé 1-100).
   * EFFET DE BORD : crée les rappels EVENT_REMINDER et TASK_REMINDER des 24h à venir.
   */
  @Get('me')
  async getMyNotifications(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const safeLimit = Number.isNaN(parsedLimit) ? 20 : parsedLimit;
    return this.notificationsService.getMyNotifications(
      req.user.userId,
      safeLimit,
    );
  }

  /**
   * GET /notifications/me/unread-count
   * Nombre de notifications non lues { count: N }. Même effet de bord rappels 24h.
   */
  @Get('me/unread-count')
  async getMyUnreadCount(@Request() req: any) {
    return this.notificationsService.getMyUnreadCount(req.user.userId);
  }

  /**
   * PATCH /notifications/:id/read
   * Marque une notification comme lue. Filtre sur (id + id_utilisateur) pour sécurité.
   */
  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') notificationId: string) {
    return this.notificationsService.markAsRead(
      req.user.userId,
      notificationId,
    );
  }

  /**
   * PATCH /notifications/me/read-all
   * Marque toutes les notifications non lues de l'utilisateur comme lues.
   */
  @Patch('me/read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}
