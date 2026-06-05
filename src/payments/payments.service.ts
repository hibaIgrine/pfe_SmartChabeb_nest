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
