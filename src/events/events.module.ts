/**
 * ============================================================
 * FICHIER : events.module.ts
 * RÔLE    : Module de gestion des événements sportifs et culturels.
 * ============================================================
 *
 * CONCEPT :
 *   Un événement est une activité ponctuellement organisée dans un local
 *   (match, tournoi, cérémonie, atelier, etc.). Il peut être lié à un club
 *   principal (club_id) et/ou des clubs collaborateurs (collaborating_club_ids).
 *
 * CYCLE DE VIE D'UN ÉVÉNEMENT :
 *   ── Création par RESPONSABLE_CLUB  ──► is_active = false (demande, attend validation)
 *   ── Création par ADMIN / RESP_CENTRE ──► is_active = true (actif immédiatement)
 *   ── Activation   (PATCH /:id/activate)      ──► is_active = true
 *   ── Désactivation (PATCH /:id/deactivate)   ──► is_active = false
 *   ── Annulation   (PATCH /:id/cancel)        ──► is_active = false + notifs participants
 *   ── Refus        (PATCH /:id/refuse-request) ──► is_active = false
 *
 * SYSTÈME DE PARTICIPANTS :
 *   Statuts : EN_ATTENTE → CONFIRME | REFUSE | ANNULE
 *   Liste d'attente automatique (promoteWaitlistIfPossible) :
 *     → Quand un participant annule ou est refusé, les EN_ATTENTE sont
 *       promus CONFIRME jusqu'à remplir la capacité de l'événement.
 *
 * CHECK-IN :
 *   - Auto check-in par le participant  (PATCH /:id/participants/me/checkin)
 *   - Check-in par le responsable       (PATCH /:id/participants/:pid/checkin)
 *   - Premier check-in récompensé : +10 points via SQL atomique (points_awarded)
 *     Le SQL utilise WHERE points_awarded = false + RETURNING pour garantir
 *     l'idempotence (les points ne sont attribués qu'une seule fois).
 *
 * FEEDBACK :
 *   - Note 1-5 + commentaire optionnel (max 500 caractères)
 *   - Upsert : modifiable après soumission initiale
 *   - Conditions : avoir participé (CONFIRME ou ANNULE) ET événement déjà commencé
 *
 * CONFLIT DE PLANNING :
 *   Lors de la création ou modification d'un événement, le service vérifie :
 *     1. Conflits avec d'autres événements  (findConflicts → table events)
 *     2. Conflits avec les réservations     (ReservationsService.checkAvailability)
 *   Si le créneau est libre → une réservation VALIDEE est créée automatiquement
 *   dans la même transaction pour bloquer le local.
 *
 * DASHBOARD STATS (getDashboardStats) :
 *   Calcule en une seule requête (filtrés par centreId ou gouvernorat) :
 *     - Nombre d'événements, participants, taux de participation / remplissage
 *     - Top 5 événements les plus populaires
 *     - Top 8 clubs par participation
 *     - Top 10 utilisateurs les plus actifs
 *     - Fréquence mensuelle des événements (tableau de bord temporel)
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD (PostgreSQL via Prisma)
 *   NotificationsModule → alertes push (modification, annulation, points gagnés)
 *   ReservationsModule  → vérification disponibilité + blocage du créneau local
 *
 * EXPORTS :
 *   EventsService → exporté pour usage potentiel par d'autres modules.
 */

import { Module } from '@nestjs/common';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ReservationsModule } from 'src/reservations/reservations.module';

@Module({
  imports: [
    PrismaModule,        // Connexion PostgreSQL
    NotificationsModule, // Notifications push (modif, annulation, points)
    ReservationsModule,  // Vérification disponibilité + réservation automatique du local
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
