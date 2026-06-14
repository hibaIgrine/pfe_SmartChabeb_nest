/**
 * ============================================================
 * FICHIER : payments.service.ts
 * RÔLE    : Logique métier paiements — orchestration BDD + Stripe.
 * ============================================================
 *
 * MÉTHODES PUBLIQUES :
 *
 *   createPaymentAndSession(reservationId, amount, returnUrl)
 *     Pipeline : 1. INSERT payments (PENDING) → 2. Stripe session → 3. UPDATE stripe_session_id
 *     Retourne : { payment, session, checkoutUrl }
 *     Le payment.id sert de référence Stripe (metadata.reference).
 *
 *   handleWebhookEvent(event)
 *     Dispatch par event.type :
 *       checkout.session.completed → handleSuccessfulPayment()
 *       checkout.session.expired   → handleExpiredPayment()
 *       payment_intent.succeeded / charge.succeeded → log (déjà géré par completed)
 *       payment_intent.created / charge.updated     → log informatif
 *       Autres → log "unhandled"
 *
 *   getUserPayments(userId, userRole)
 *     ADMIN → tous les payments PAID avec reservation+local+centre
 *     Autres → PAID filtrés par reservation.id_utilisateur = userId
 *     Retourne : tableau formaté (payment_method hardcodé à 'stripe')
 *
 *   getAdminCentreRevenueOverview(scope?, month?)
 *     scope='month' → filtre sur monthRange; sinon global (tous les PAID)
 *     Agrège par centre via Map<centreId, {...}> en JS (pas de GROUP BY SQL)
 *     Inclut les centres sans paiement (totalAmount=0) grâce à findMany(centres) initial
 *     Retourne : { scope, month, label, totalAmount, totalPayments, centres[], generatedAt }
 *
 *   getCentreRevenueForResponsable(userId, scope?, month?)
 *     Récupère id_centre de l'utilisateur, filtre payments par local.id_centre
 *     Agrège par local via Map<localId, {...}>
 *     Retourne : { scope, month, label, totalAmount, totalPayments, centre{...}, locaux[], generatedAt }
 *
 * MÉTHODES PRIVÉES :
 *
 *   handleSuccessfulPayment(session)
 *     Cherche payment par stripe_session_id → UPDATE status=PAID, stripe_payment_id=session.payment_intent
 *     Puis UPDATE reservations_locaux SET statut='CONFIRME'
 *     Si réservation introuvable (err catch) → log warn, pas de throw
 *
 *   handleExpiredPayment(session)
 *     Cherche payment par stripe_session_id → UPDATE status=CANCELLED
 *     Ne modifie pas la réservation (l'utilisateur peut réessayer)
 *
 *   buildMonthRange(monthInput?)
 *     Parsé 'YYYY-MM' → { start: Date(année, mois-1, 1), end: Date(année, mois, 0 = dernier jour) }
 *     Si monthInput invalide → mois courant par défaut
 *     end.setHours(23,59,59,999) pour inclure tout le dernier jour
 *
 * TABLE PRISMA PRINCIPALE : payments
 *   id, reservation_id, amount, status, stripe_session_id, stripe_payment_id, created_at, updated_at
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  /**
   * Crée un paiement PENDING en BDD puis une session Stripe Checkout.
   * Pipeline : INSERT payments → Stripe.createCheckoutSession → UPDATE stripe_session_id
   * Le payment.id est utilisé comme 'reference' dans les metadata Stripe.
   */
  async createPaymentAndSession(
    reservationId: string,
    amount: number,
    returnUrl: string,
  ) {
    // Create DB record first
    const payment = await this.prisma.payments.create({
      data: {
        reservation_id: reservationId,
        amount,
        status: 'PENDING',
      },
    });

    // Create Stripe session
    const session = await this.stripe.createCheckoutSession(
      amount,
      payment.id,
      returnUrl,
    );

    const checkoutUrl = session.url;

    // Save session id returned by Stripe
    await this.prisma.payments.update({
      where: { id: payment.id },
      data: { stripe_session_id: session.id },
    });

    return { payment, session, checkoutUrl };
  }

  /**
   * Dispatch les événements Stripe reçus par le webhook.
   * checkout.session.completed → PAID + réservation CONFIRME
   * checkout.session.expired   → CANCELLED
   */
  async handleWebhookEvent(event: any) {
    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        this.logger.log('Processing checkout.session.completed event');
        const session = event.data.object;
        this.logger.log('Session ID:', session.id);
        this.logger.log('Session payment_intent:', session.payment_intent);
        this.logger.log('Session status:', session.status);
        await this.handleSuccessfulPayment(session);
        break;
      case 'checkout.session.expired':
        await this.handleExpiredPayment(event.data.object);
        break;
      case 'payment_intent.succeeded':
      case 'charge.succeeded':
        // Ces événements sont déjà gérés via checkout.session.completed
        this.logger.log(`Payment event received: ${event.type}`);
        break;
      case 'payment_intent.created':
      case 'charge.updated':
        // Événements informatifs, pas besoin de traitement spécial
        this.logger.log(`Info event received: ${event.type}`);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { ok: true };
  }

  /**
   * Traite un paiement réussi : met le payment à PAID et la réservation à CONFIRME.
   * Recherche par stripe_session_id (sauvegardé lors de createPaymentAndSession).
   * L'échec de mise à jour de la réservation est loggé en warn sans rethrow.
   */
  private async handleSuccessfulPayment(session: any) {
    this.logger.log('Looking for payment with session id:', session.id);

    const payment = await this.prisma.payments.findFirst({
      where: { stripe_session_id: session.id },
    });

    if (!payment) {
      this.logger.warn('Payment not found for session id ' + session.id);
      // Log all existing payments for debugging
      const allPayments = await this.prisma.payments.findMany({
        select: { id: true, stripe_session_id: true, status: true },
      });
      this.logger.log(
        'Existing payments:',
        JSON.stringify(allPayments, null, 2),
      );
      return { ok: false };
    }

    this.logger.log('Found payment:', JSON.stringify(payment, null, 2));
    this.logger.log(
      'Updating payment status to PAID for payment ID:',
      payment.id,
    );

    await this.prisma.payments.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        stripe_payment_id: session.payment_intent,
      },
    });

    this.logger.log('Payment updated successfully to PAID');

    // Mark reservation as CONFIRMED
    try {
      this.logger.log(
        'Updating reservation status to CONFIRME for reservation ID:',
        payment.reservation_id,
      );

      await this.prisma.reservations_locaux.update({
        where: { id: payment.reservation_id },
        data: { statut: 'CONFIRME' },
      });

      this.logger.log('Reservation status updated successfully to CONFIRME');
    } catch (err) {
      this.logger.warn(
        'Failed to update reservation status: ' + (err as any).message,
      );
    }
  }

  /**
   * Retourne les paiements PAID visibles par l'utilisateur.
   * ADMIN → tous les paiements PAID ; autres → filtre par reservation.id_utilisateur.
   * Inclut les détails de la réservation, du local et du centre.
   */
  async getUserPayments(userId: string, userRole: string) {
    this.logger.log(
      `Getting payments for user ${userId} with role ${userRole}`,
    );

    // D'abord, vérifions tous les paiements dans la base
    const allPayments = await this.prisma.payments.findMany({
      select: {
        id: true,
        amount: true,
        status: true,
        created_at: true,
        reservation_id: true,
        stripe_session_id: true,
      },
    });
    this.logger.log(`Total payments in database: ${allPayments.length}`);
    this.logger.log('All payments:', JSON.stringify(allPayments, null, 2));

    let whereClause: any = {
      status: 'PAID', // Uniquement les paiements effectués
    };

    // Si l'utilisateur n'est pas admin, filtrer par ses réservations
    if (userRole !== 'ADMIN') {
      whereClause = {
        ...whereClause,
        reservation: {
          id_utilisateur: userId,
        },
      };
      this.logger.log(
        `Filtering for user ${userId} with where clause:`,
        JSON.stringify(whereClause, null, 2),
      );
    }

    const payments = await this.prisma.payments.findMany({
      where: whereClause,
      include: {
        reservation: {
          include: {
            local: {
              include: {
                centre: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    this.logger.log(
      `Found ${payments.length} payments for user ${userId} with role ${userRole}`,
    );
    this.logger.log('Filtered payments:', JSON.stringify(payments, null, 2));

    return payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      payment_method: 'stripe', // Par défaut, on utilise Stripe
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      reservation: payment.reservation
        ? {
            id: payment.reservation.id,
            objet: payment.reservation.objet,
            local: {
              nom: payment.reservation.local.nom,
            },
            date_reservation: payment.reservation.date_reservation,
          }
        : null,
      stripe_session_id: payment.stripe_session_id,
      stripe_payment_id: payment.stripe_payment_id,
    }));
  }

  /**
   * Construit { start, end, label } pour un mois donné en format 'YYYY-MM'.
   * Si monthInput est invalide ou absent → mois courant par défaut.
   * end est mis à 23:59:59.999 pour inclure toute la journée du dernier jour du mois.
   */
  private buildMonthRange(monthInput?: string) {
    const [yearPart, monthPart] = (monthInput || '').split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);

    if (!year || !month || month < 1 || month > 12) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return {
        start,
        end,
        label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      };
    }

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    end.setHours(23, 59, 59, 999);

    return {
      start,
      end,
      label: `${year}-${String(month).padStart(2, '0')}`,
    };
  }

  /**
   * Revenus de tous les centres pour l'ADMIN.
   * Charge tous les centres d'abord (findMany) pour avoir les entrées à 0 dans le résultat.
   * Agrège via Map<centreId, stats> en JS — pas de GROUP BY SQL.
   * Retourne les centres triés par totalAmount décroissant.
   */
  async getAdminCentreRevenueOverview(scope?: string, month?: string) {
    const normalizedScope = scope === 'month' ? 'month' : 'global';
    const monthRange = this.buildMonthRange(month);

    const payments = await this.prisma.payments.findMany({
      where: {
        status: 'PAID',
        ...(normalizedScope === 'month'
          ? {
              created_at: {
                gte: monthRange.start,
                lte: monthRange.end,
              },
            }
          : {}),
      },
      select: {
        id: true,
        amount: true,
        created_at: true,
        reservation: {
          select: {
            id: true,
            local: {
              select: {
                id: true,
                nom: true,
                centre: {
                  select: {
                    id: true,
                    nom: true,
                    gouvernorat: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const centres = await this.prisma.centres.findMany({
      select: {
        id: true,
        nom: true,
        gouvernorat: true,
      },
      orderBy: { nom: 'asc' },
    });

    const revenueByCentre = new Map<
      string,
      {
        id: string;
        nom: string;
        gouvernorat: string | null;
        totalAmount: number;
        paymentCount: number;
        reservationIds: Set<string>;
      }
    >();

    for (const centre of centres) {
      revenueByCentre.set(centre.id, {
        id: centre.id,
        nom: centre.nom,
        gouvernorat: centre.gouvernorat ?? null,
        totalAmount: 0,
        paymentCount: 0,
        reservationIds: new Set<string>(),
      });
    }

    let totalAmount = 0;

    for (const payment of payments) {
      const centre = payment.reservation?.local?.centre;
      if (!centre) {
        continue;
      }

      const current = revenueByCentre.get(centre.id) ?? {
        id: centre.id,
        nom: centre.nom,
        gouvernorat: centre.gouvernorat ?? null,
        totalAmount: 0,
        paymentCount: 0,
        reservationIds: new Set<string>(),
      };

      const amount = Number(payment.amount) || 0;
      current.totalAmount += amount;
      current.paymentCount += 1;
      current.reservationIds.add(payment.reservation.id);
      revenueByCentre.set(centre.id, current);
      totalAmount += amount;
    }

    const formattedCentres = [...revenueByCentre.values()]
      .map((centre) => ({
        id: centre.id,
        nom: centre.nom,
        gouvernorat: centre.gouvernorat,
        totalAmount: Number(centre.totalAmount.toFixed(2)),
        paymentCount: centre.paymentCount,
        reservationCount: centre.reservationIds.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      scope: normalizedScope,
      month: normalizedScope === 'month' ? monthRange.label : null,
      label: normalizedScope === 'month' ? monthRange.label : 'global',
      totalAmount: Number(totalAmount.toFixed(2)),
      totalPayments: payments.length,
      centres: formattedCentres,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Revenus du centre du responsable connecté, ventilés par local.
   * Si l'utilisateur n'a pas de id_centre → retourne un objet vide cohérent.
   * Agrège via Map<localId, stats> en JS. Locaux triés par totalAmount décroissant.
   */
  async getCentreRevenueForResponsable(userId: string, scope?: string, month?: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id_centre: true },
    });

    const centreId = user?.id_centre;
    if (!centreId) {
      return {
        scope: 'global',
        month: null,
        label: 'global',
        totalAmount: 0,
        totalPayments: 0,
        centre: null,
        locaux: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const normalizedScope = scope === 'month' ? 'month' : 'global';
    const monthRange = this.buildMonthRange(month);

    const centre = await this.prisma.centres.findUnique({
      where: { id: centreId },
      select: { id: true, nom: true, gouvernorat: true },
    });

    const payments = await this.prisma.payments.findMany({
      where: {
        status: 'PAID',
        reservation: { local: { id_centre: centreId } },
        ...(normalizedScope === 'month'
          ? { created_at: { gte: monthRange.start, lte: monthRange.end } }
          : {}),
      },
      select: {
        id: true,
        amount: true,
        reservation: {
          select: {
            id: true,
            local: { select: { id: true, nom: true } },
          },
        },
      },
    });

    const revenueByLocal = new Map<
      string,
      { id: string; nom: string; totalAmount: number; paymentCount: number; reservationIds: Set<string> }
    >();

    let totalAmount = 0;

    for (const payment of payments) {
      const local = payment.reservation?.local;
      if (!local) continue;

      const current = revenueByLocal.get(local.id) ?? {
        id: local.id,
        nom: local.nom,
        totalAmount: 0,
        paymentCount: 0,
        reservationIds: new Set<string>(),
      };

      const amount = Number(payment.amount) || 0;
      current.totalAmount += amount;
      current.paymentCount += 1;
      current.reservationIds.add(payment.reservation.id);
      revenueByLocal.set(local.id, current);
      totalAmount += amount;
    }

    const locaux = [...revenueByLocal.values()]
      .map((l) => ({
        id: l.id,
        nom: l.nom,
        totalAmount: Number(l.totalAmount.toFixed(2)),
        paymentCount: l.paymentCount,
        reservationCount: l.reservationIds.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      scope: normalizedScope,
      month: normalizedScope === 'month' ? monthRange.label : null,
      label: normalizedScope === 'month' ? monthRange.label : 'global',
      totalAmount: Number(totalAmount.toFixed(2)),
      totalPayments: payments.length,
      centre: centre
        ? { id: centre.id, nom: centre.nom, gouvernorat: centre.gouvernorat ?? null }
        : null,
      locaux,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Traite une session expirée : met le payment à CANCELLED.
   * La réservation reste inchangée — l'utilisateur peut tenter un nouveau paiement.
   */
  private async handleExpiredPayment(session: any) {
    const payment = await this.prisma.payments.findFirst({
      where: { stripe_session_id: session.id },
    });

    if (payment) {
      await this.prisma.payments.update({
        where: { id: payment.id },
        data: { status: 'CANCELLED' },
      });
    }
  }
}
