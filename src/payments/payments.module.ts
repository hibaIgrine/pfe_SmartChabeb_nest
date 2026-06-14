/**
 * ============================================================
 * FICHIER : payments.module.ts
 * RÔLE    : Module de gestion des paiements en ligne via Stripe.
 * ============================================================
 *
 * CONCEPT :
 *   Ce module permet de créer des sessions de paiement Stripe pour les réservations
 *   de locaux et de traiter les événements retournés par Stripe via webhook.
 *
 * TABLE PRISMA : payments
 *   Champs clés : reservation_id, amount, status, stripe_session_id, stripe_payment_id
 *   Statuts : PENDING → PAID (via webhook checkout.session.completed)
 *              PENDING → CANCELLED (via webhook checkout.session.expired)
 *
 * FLUX DE PAIEMENT COMPLET :
 *   1. Client appelle POST /payments/create (ou POST /reservations/create-with-payment)
 *      → PaymentsService.createPaymentAndSession() :
 *         a. Crée un enregistrement payments en BDD (status=PENDING)
 *         b. Appelle StripeService.createCheckoutSession() → obtient session.id + session.url
 *         c. Sauvegarde stripe_session_id dans payments
 *         d. Retourne checkoutUrl (URL de paiement Stripe) + paymentId
 *   2. Client est redirigé vers checkoutUrl pour payer
 *   3. Stripe envoie un webhook POST /payments/webhook :
 *      a. checkout.session.completed → PAID + réservation → CONFIRME
 *      b. checkout.session.expired  → CANCELLED
 *
 * CONVERSION TND → USD :
 *   Stripe ne supporte pas le TND (dinar tunisien).
 *   Le service convertit le montant : amount_usd = Math.round(amount_tnd × 0.32 × 100) cents.
 *   Cette conversion est approximative (taux fixe, non mis à jour).
 *
 * REVENUS (STATISTIQUES) :
 *   - ADMIN → getAdminCentreRevenueOverview : tous les paiements PAID groupés par centre
 *   - RESP_CENTRE → getCentreRevenueForResponsable : paiements PAID de son centre groupés par local
 *   - Filtrable par scope (global / month) et mois (YYYY-MM)
 *
 * PROVIDERS :
 *   PaymentsService → logique métier (DB + orchestration)
 *   StripeService   → wrapper Stripe SDK (sessions, webhook signature)
 *   PrismaService   → injecté directement (pas via PrismaModule)
 *
 * IMPORTS :
 *   ConfigModule → accès à STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET depuis .env
 *
 * EXPORTS :
 *   PaymentsService → utilisé par ReservationsController (create-with-payment)
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [ConfigModule], // Accès aux variables d'environnement Stripe
  providers: [
    PaymentsService, // Logique métier paiements
    StripeService,   // Wrapper Stripe SDK
    PrismaService,   // Accès BDD directement (pas via PrismaModule)
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService], // Utilisé par ReservationsController
})
export class PaymentsModule {}
