/**
 * ============================================================
 * FICHIER : club-tasks.module.ts
 * RÔLE    : Module de gestion des tâches internes des clubs.
 * ============================================================
 *
 * Concept : Chaque club peut créer des "tâches" (missions) à assigner
 * à ses membres staff. Exemple : préparer le matériel pour un match,
 * organiser un atelier, rédiger un compte-rendu, etc.
 *
 * TABLES PRISMA UTILISÉES :
 *   - club_taches            → les tâches elles-mêmes
 *   - club_tache_affectations → qui est assigné à quelle tâche
 *   - club_tache_preuves     → preuves d'achèvement (photos/docs)
 *   - club_tache_commentaires → commentaires sur la tâche
 *
 * CYCLE DE VIE D'UNE TÂCHE (machine d'états) :
 *   EN_ATTENTE → EN_COURS → TERMINE → VALIDEE
 *                                   ↘ REFUSE
 *   Depuis EN_ATTENTE ou EN_COURS → ANNULE
 *
 * DEUX CONTROLLERS :
 *   ClubTasksController  → routes sous /clubs/:clubId/tasks
 *   StaffTasksController → route GET /staff/tasks/assigned
 *     (vue globale : toutes les tâches assignées à moi, tous clubs confondus)
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD
 *   NotificationsModule → alertes push lors des affectations / changements de statut
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ClubTasksController } from './club-tasks.controller';
import { ClubTasksService } from './club-tasks.service';
import { StaffTasksController } from './staff-tasks.controller';

@Module({
  imports: [
    PrismaModule,        // Connexion PostgreSQL
    NotificationsModule, // Notifications push lors des affectations et changements d'état
  ],
  controllers: [
    ClubTasksController,  // Routes /clubs/:clubId/tasks/*
    StaffTasksController, // Route /staff/tasks/assigned (vue globale staff)
  ],
  providers: [ClubTasksService],
})
export class ClubTasksModule {}
