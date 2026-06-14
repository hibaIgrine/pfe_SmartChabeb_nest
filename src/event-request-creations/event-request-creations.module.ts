/**
 * ============================================================
 * FICHIER : event-request-creations.module.ts
 * RÔLE    : Module de gestion des demandes de création d'événement.
 * ============================================================
 *
 * CONCEPT : workflow de demande d'événement
 *   Ce module fournit une alternative structurée à la création directe d'événements.
 *   Un RESPONSABLE_CLUB (ou tout rôle éligible) soumet une demande → un ADMIN ou
 *   RESPONSABLE_CENTRE la valide ou la refuse.
 *
 *   TABLE PRISMA : event_request_creations
 *   Champs clés : nom, date_event, start_time, end_time, locaux_id, club_id,
 *     collaborating_club_ids, capacity, timeline, status, created_by, reviewed_by, event_id
 *
 * CYCLE DE VIE D'UNE DEMANDE :
 *   POST /event-request-creations            → statut : PENDING
 *   PATCH /:id/approve  [ADMIN, RESP_CENTRE] → statut : APPROVED
 *     → eventsService.create() appelé avec le reviewer comme créateur
 *       (is_active = true car reviewer est ADMIN ou RESP_CENTRE)
 *     → event_id lié à la demande approuvée
 *   PATCH /:id/refuse   [ADMIN, RESP_CENTRE] → statut : REFUSED
 *
 * DIFFÉRENCE AVEC LA CRÉATION DIRECTE (POST /events) :
 *   - POST /events par RESP_CLUB → événement créé is_active=false dans la table events
 *     (demande implicite, pas de table dédiée)
 *   - POST /event-request-creations → stocké dans event_request_creations (PENDING)
 *     L'événement N'EST PAS encore créé. Il est créé seulement lors de l'approbation.
 *
 * VISIBILITÉ (findMyRequests) :
 *   RESPONSABLE_CENTRE → toutes les demandes de son centre
 *   RESPONSABLE_CLUB   → ses demandes + demandes impliquant ses clubs (primaire ou collaborateurs)
 *   Autres             → uniquement ses propres demandes
 *
 * RBAC :
 *   Création : ADMIN, RESPONSABLE_CENTRE, RESPONSABLE_CLUB
 *   Consultation des demandes en attente : ADMIN, RESPONSABLE_CENTRE
 *   Approbation / Refus : ADMIN, RESPONSABLE_CENTRE
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD
 *   NotificationsModule → importé (disponible si besoin de notifications futures)
 *   ReservationsModule  → importé (disponible pour vérification de créneaux si besoin)
 *   EventsModule        → eventsService.create() appelé lors de l'approbation
 */

import { Module } from '@nestjs/common';
import { EventsModule } from 'src/events/events.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ReservationsModule } from 'src/reservations/reservations.module';
import { EventRequestCreationsController } from './event-request-creations.controller';
import { EventRequestCreationsService } from './event-request-creations.service';

@Module({
  imports: [
    PrismaModule,        // Connexion PostgreSQL
    NotificationsModule, // Notifications push (disponible pour extensions futures)
    ReservationsModule,  // Vérification de disponibilité (disponible pour extensions)
    EventsModule,        // eventsService.create() appelé lors de l'approbation
  ],
  controllers: [EventRequestCreationsController],
  providers: [EventRequestCreationsService],
})
export class EventRequestCreationsModule {}
