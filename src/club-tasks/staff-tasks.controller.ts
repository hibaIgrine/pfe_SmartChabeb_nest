/**
 * ============================================================
 * FICHIER : staff-tasks.controller.ts
 * RÔLE    : Vue globale des tâches assignées au staff connecté.
 * ============================================================
 *
 * Contexte : ClubTasksController fournit les tâches par club (/clubs/:clubId/tasks).
 * Ce controller complémentaire fournit UNE SEULE route qui retourne
 * TOUTES les tâches assignées à l'utilisateur, tous clubs confondus.
 *
 * ROUTE :
 *   GET /staff/tasks/assigned
 *     → Retourne toutes les club_taches où l'utilisateur a une affectation,
 *       peu importe le club.
 *     → Trié par date_limite ASC puis created_at DESC.
 *     → Utile pour la page "Mes tâches" dans l'app Flutter (tableau de bord staff).
 *
 * Pas de RolesGuard ici : tout utilisateur connecté peut consulter ses propres tâches.
 */

import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClubTasksService } from './club-tasks.service';

@Controller('staff/tasks')
@UseGuards(AuthGuard('jwt'))
export class StaffTasksController {
  constructor(private readonly clubTasksService: ClubTasksService) {}

  /**
   * GET /staff/tasks/assigned
   * Toutes les tâches assignées à l'utilisateur connecté, tous clubs confondus.
   * Inclut pour chaque tâche : club, créateur, affectations, commentaires, preuves.
   */
  @Get('assigned')
  async findAssignedAcrossClubs(@Request() req: any) {
    return await this.clubTasksService.findAssignedTasksAcrossClubs(
      req.user.userId,
    );
  }
}
