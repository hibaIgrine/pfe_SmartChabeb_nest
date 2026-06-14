/**
 * ============================================================
 * FICHIER : payments.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des paiements Stripe.
 * ============================================================
 *
 * BASE URL : /payments
 *
 * ROUTES EXPOSÉES :
 *
 *   GET /payments/my-payments                     [JWT requis]
 *     → Retourne les paiements PAID visibles par l'utilisateur.
 *     → ADMIN : voit TOUS les paiements PAID avec détails (local, centre).
 *     → Autres : voit uniquement ses propres paiements (filtre reservation.id_utilisateur).
 *     → Inclut : amount, status, reservation (objet, local.nom, date), stripe_session_id.
 *
 *   GET /payments/admin/centre-revenues            [ADMIN]
 *     → Revenus agrégés par centre (tous les paiements PAID).
 *     → Query params :
 *         scope  = 'month' | autre → filtre au mois ou vue globale
 *         month  = 'YYYY-MM'       → mois à analyser (défaut : mois courant)
 *     → Retourne : totalAmount, totalPayments, centres[] triés par revenu desc.
 *
 *   GET /payments/centre/revenues                  [RESPONSABLE_CENTRE]
 *     → Revenus du centre de l'utilisateur, ventilés par local.
 *     → Mêmes query params que ci-dessus (scope, month).
 *     → Retourne : totalAmount, totalPayments, centre{...}, locaux[] triés par revenu desc.
 *
 *   POST /payments/create
 *     → Crée un paiement en BDD (PENDING) + session Stripe Checkout.
 *     → Body : CreatePaymentDto { reservationId, amount (TND), returnUrl }
 *     → Retourne : { checkoutUrl, paymentId }
 *     → checkoutUrl est l'URL Stripe vers laquelle rediriger l'utilisateur.
 *
 *   POST /payments/pay-reservation
 *     → Raccourci pour payer une réservation sans spécifier le montant.
 *     → Body : { reservationId, returnUrl? }
 *     → Vérifie que la réservation est EN_ATTENTE ou VALIDEE.
 *     → Récupère prix_total depuis la BDD et appelle createPaymentAndSession.
 *     → returnUrl par défaut : http://localhost:5173/reservations/my-reservations
 *     → Retourne : { checkoutUrl, paymentId, amount }
 *
 *   POST /payments/webhook                         [Stripe uniquement]
 *     → Reçoit les événements Stripe (checkout.session.completed, expired, etc.)
 *     → Vérifie la signature via l'en-tête 'stripe-signature' + STRIPE_WEBHOOK_SECRET.
 *     → Signature invalide → retour 400.
 *     → Si valide → appelle handleWebhookEvent(event) dans PaymentsService.
 *     → IMPORTANT : le rawBody doit être le corps brut (non parsé) pour la vérification.
 *       NestJS doit être configuré avec rawBody: true dans main.ts.
 *
 * RBAC :
 *   /my-payments : AuthGuard('jwt') — tous les utilisateurs authentifiés
 *   /admin/centre-revenues : ADMIN seulement
 *   /centre/revenues : RESPONSABLE_CENTRE seulement
 *   /create, /pay-reservation, /webhook : pas de garde de rôle (accès ouvert)
 */

import {
  Body,
  Controller,
  Post,
  Get,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { StripeService } from './stripe.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private payments: PaymentsService,
    private stripe: StripeService,
  ) {}

  /**
   * GET /payments/my-payments
   * Paiements PAID visibles : ADMIN → tous, autres → uniquement les siens.
   */
  @Get('my-payments')
  @UseGuards(AuthGuard('jwt'))
  async getMyPayments(@Req() req) {
    const userId = req.user.userId;
    const userRole = req.user.role;

    this.logger.log(
      `Getting payments for user ${userId} with role ${userRole}`,
    );

    return await this.payments.getUserPayments(userId, userRole);
  }

  /**
   * GET /payments/admin/centre-revenues
   * Revenus de TOUS les centres agrégés par centre, triés par totalAmount desc.
   * scope='month' + month='YYYY-MM' pour filtrer sur un mois précis.
   */
  @Get('admin/centre-revenues')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async getCentreRevenues(
    @Query('scope') scope?: string,
    @Query('month') month?: string,
  ) {
    return await this.payments.getAdminCentreRevenueOverview(scope, month);
  }

  /**
   * GET /payments/centre/revenues
   * Revenus du centre de l'utilisateur connecté, ventilés par local.
   * scope='month' + month='YYYY-MM' pour filtrer sur un mois précis.
   */
  @Get('centre/revenues')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CENTRE')
  async getMyCentreRevenues(
    @Req() req,
    @Query('scope') scope?: string,
    @Query('month') month?: string,
  ) {
    return await this.payments.getCentreRevenueForResponsable(req.user.userId, scope, month);
  }

  /**
   * POST /payments/create
   * Crée un paiement PENDING en BDD puis une session Stripe Checkout.
   * Retourne { checkoutUrl, paymentId } — rediriger l'utilisateur vers checkoutUrl.
   */
  @Post('create')
  async create(@Body() body: CreatePaymentDto) {
    const { reservationId, amount, returnUrl } = body as any;
    const result = await this.payments.createPaymentAndSession(
      reservationId,
      amount,
      returnUrl,
    );
    // Expect stripe session contains a redirect URL
    const checkoutUrl = result.checkoutUrl ?? result.session?.url ?? null;
    return { checkoutUrl, paymentId: result.payment.id };
  }

  /**
   * POST /payments/pay-reservation
   * Raccourci pour payer une réservation : récupère prix_total depuis la BDD.
   * Vérifie que statut est EN_ATTENTE ou VALIDEE. returnUrl est optionnel.
   */
  @Post('pay-reservation')
  async payReservation(
    @Body() body: { reservationId: string; returnUrl?: string },
  ) {
    const { reservationId, returnUrl } = body;

    // Récupérer les détails de la réservation
    const reservation = await this.payments[
      'prisma'
    ].reservations_locaux.findUnique({
      where: { id: reservationId },
      include: {
        local: true,
      },
    });

    if (!reservation) {
      throw new Error('Réservation non trouvée');
    }

    if (!['EN_ATTENTE', 'VALIDEE'].includes(reservation.statut)) {
      throw new Error('Cette réservation ne peut pas être payée');
    }

    // Créer la session de paiement Stripe
    const result = await this.payments.createPaymentAndSession(
      reservationId,
      Number(reservation.prix_total),
      returnUrl || 'http://localhost:5173/reservations/my-reservations',
    );

    return {
      checkoutUrl: result.checkoutUrl,
      paymentId: result.payment.id,
      amount: reservation.prix_total,
    };
  }

  /**
   * POST /payments/webhook
   * Point d'entrée Stripe — vérifie la signature 'stripe-signature', puis dispatche l'événement.
   * checkout.session.completed → PAID + réservation CONFIRME
   * checkout.session.expired  → CANCELLED
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    this.logger.log('Webhook received - Starting processing');

    const raw = (req as any).rawBody ?? JSON.stringify(req.body);
    this.logger.log('Raw body length:', raw.length);

    let event;
    try {
      event = JSON.parse(raw);
      this.logger.log('Webhook event type:', event.type);
      this.logger.log('Webhook event ID:', event.id);
    } catch (error) {
      this.logger.error('Failed to parse webhook body', error);
      return res.status(400).send({ ok: false, message: 'Invalid JSON' });
    }

    const verified = this.stripe.verifyWebhookSignature(raw, signature);
    if (!verified) {
      this.logger.error('Webhook signature verification failed');
      return res.status(400).send({ ok: false, message: 'Invalid signature' });
    }

    this.logger.log('Webhook signature verified successfully');

    try {
      await this.payments.handleWebhookEvent(event);
      this.logger.log('Webhook event processed successfully');
    } catch (error) {
      this.logger.error('Error processing webhook event:', error);
      return res.status(500).send({ ok: false, message: 'Processing error' });
    }

    return res.send({ ok: true });
  }
}
