/**
 * ============================================================
 * FICHIER : club-creation-requests.module.ts
 * RÔLE    : Module de gestion des demandes de création de club.
 * ============================================================
 *
 * CONCEPT : Workflow de création de club à la demande d'un adhérent
 * ─────────────────────────────────────────────────────────────────
 * Dans SmartChabeb, un simple ADHÉRENT peut proposer de créer un nouveau club.
 * Il soumet une demande avec :
 *   - Nom, catégorie, description du club souhaité
 *   - Objectifs (liste)
 *   - Créneau horaire souhaité (jour récurrent + heures + local)
 *   - Documents justificatifs : CV + attestation de compétence (fichiers uploadés)
 *   - Logo du club (optionnel)
 *
 * CYCLE DE VIE DE LA DEMANDE :
 *   EN_ATTENTE (soumise) → ACCEPTEE ou REFUSEE (décidée par ADMIN/RESPONSABLE_CENTRE)
 *
 * SI ACCEPTÉE (dans une $transaction) :
 *   1. Vérifie la disponibilité du local pour les 52 prochains créneaux
 *   2. Crée 52 réservations récurrentes dans reservations_locaux
 *   3. Crée (ou réactive) le club officiel dans la table clubs
 *   4. Promeut l'adhérent en RESPONSABLE_CLUB
 *   5. Envoie une notification push à l'adhérent
 *
 * TABLE PRISMA : demandes_creation_clubs
 *   (accédée via (this.prisma as any).demandes_creation_clubs car
 *    le modèle Prisma peut ne pas être typé si le schema a été mis à jour récemment)
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD
 *   ReservationsModule  → vérification disponibilité du local (checkAvailability)
 *   NotificationsModule → notification de décision à l'adhérent demandeur
 */

import { Module } from '@nestjs/common';
import { ClubCreationRequestsController } from './club-creation-requests.controller';
import { ClubCreationRequestsService } from './club-creation-requests.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ReservationsModule } from 'src/reservations/reservations.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,        // Connexion PostgreSQL
    ReservationsModule,  // Vérification des créneaux du local (checkAvailability)
    NotificationsModule, // Notification push à l'adhérent (acceptation/refus)
  ],
  controllers: [ClubCreationRequestsController],
  providers: [ClubCreationRequestsService],
})
export class ClubCreationRequestsModule {}
