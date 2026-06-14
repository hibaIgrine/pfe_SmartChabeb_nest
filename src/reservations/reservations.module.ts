/**
 * ============================================================
 * FICHIER : reservations.module.ts
 * RÔLE    : Module de réservation de locaux (salles, terrains, espaces).
 * ============================================================
 *
 * CONCEPT : Un utilisateur peut réserver un local pour un créneau horaire précis.
 * La réservation passe par un workflow de validation :
 *
 *   EN_ATTENTE  ──► VALIDEE  (décision admin / responsable centre)
 *               └──► REFUSEE
 *   VALIDEE / EN_ATTENTE ──► ANNULEE  (par l'auteur ou l'admin)
 *
 * TABLE PRISMA : reservations_locaux
 *   Champs principaux : date_reservation, heure_debut, heure_fin, objet,
 *                       statut, prix_total, id_utilisateur, id_local
 *
 * DEUX TYPES DE RÉSERVATIONS dans le système :
 *   1. Réservations directes : créées par un utilisateur via ce module
 *   2. Réservations récurrentes : créées automatiquement lors de la validation
 *      d'un club ou d'une demande de création de club (objet commence par "Créneau club validé:")
 *      → Ces dernières sont EXCLUES des listes du responsable centre
 *
 * ALGORITHME ANTI-CONFLIT (checkAvailability) :
 *   Vérifie 3 cas de chevauchement :
 *     - La nouvelle réservation commence PENDANT une existante
 *     - La nouvelle réservation finit PENDANT une existante
 *     - La nouvelle réservation ENGLOBE TOTALEMENT une existante
 *   Utilisé aussi par les modules clubs et club-creation-requests.
 *
 * INTÉGRATION PAIEMENT :
 *   PaymentsModule est importé pour la route POST /reservations/create-with-payment
 *   qui crée la réservation ET initie une session de paiement en ligne.
 *
 * IMPORTS :
 *   PrismaModule        → accès BDD
 *   NotificationsModule → alertes push lors des décisions (VALIDEE / REFUSEE)
 *   PaymentsModule      → création de session de paiement en ligne
 *
 * EXPORTS :
 *   ReservationsService est exporté pour être utilisé par :
 *     - ClubsModule      (réservations récurrentes du planning club)
 *     - ClubCreationRequestsModule (réservations lors de l'acceptation d'une demande)
 */

import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    PrismaModule,        // Connexion PostgreSQL
    NotificationsModule, // Notifications push décisions VALIDEE / REFUSEE
    PaymentsModule,      // Session de paiement en ligne lors de la réservation
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService], // Utilisé par ClubsModule et ClubCreationRequestsModule
})
export class ReservationsModule {}
