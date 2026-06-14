/**
 * ============================================================
 * FICHIER : clubs.module.ts
 * RÔLE    : Module de gestion des clubs (associations, activités).
 * ============================================================
 *
 * Un "Club" dans SmartChabeb est une activité organisée au sein d'un centre :
 * club de football, théâtre, robotique, musique, etc.
 * Chaque club appartient à un centre (id_centre) et peut avoir :
 *   - un coach / responsable (id_coach)
 *   - des membres inscrits (table inscriptions_clubs)
 *   - un staff (table club_staff)
 *   - un planning hebdomadaire (JSON)
 *   - des réservations récurrentes de locaux générées automatiquement
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD PostgreSQL
 *   NotificationsModule → envoi de notifications push aux membres lors des décisions
 *                         d'inscription (ACCEPTÉ / REFUSÉ)
 *   ReservationsModule  → vérification des disponibilités des locaux avant de créer
 *                         les créneaux récurrents du club (évite les conflits)
 */

import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ReservationsModule } from 'src/reservations/reservations.module';

@Module({
  imports: [
    PrismaModule,          // Connexion PostgreSQL
    NotificationsModule,   // Notifications push pour les décisions d'adhésion
    ReservationsModule,    // Vérification des disponibilités de locaux
  ],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
