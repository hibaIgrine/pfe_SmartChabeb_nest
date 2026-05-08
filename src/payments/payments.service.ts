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
        select: { id: true, stripe_session_id: true, status: true }
      });
      this.logger.log('Existing payments:', JSON.stringify(allPayments, null, 2));
      return { ok: false };
    }

    this.logger.log('Found payment:', JSON.stringify(payment, null, 2));
    this.logger.log('Updating payment status to PAID for payment ID:', payment.id);

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
      this.logger.log('Updating reservation status to CONFIRME for reservation ID:', payment.reservation_id);
      
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
    this.logger.log(`Getting payments for user ${userId} with role ${userRole}`);
    
    // D'abord, vérifions tous les paiements dans la base
    const allPayments = await this.prisma.payments.findMany({
      select: {
        id: true,
        amount: true,
        status: true,
        created_at: true,
        reservation_id: true,
        stripe_session_id: true
      }
    });
    this.logger.log(`Total payments in database: ${allPayments.length}`);
    this.logger.log('All payments:', JSON.stringify(allPayments, null, 2));
    
    let whereClause: any = {
      status: 'PAID'  // Uniquement les paiements effectués
    };
    
    // Si l'utilisateur n'est pas admin, filtrer par ses réservations
    if (userRole !== 'ADMIN') {
      whereClause = {
        ...whereClause,
        reservation: {
          id_utilisateur: userId
        }
      };
      this.logger.log(`Filtering for user ${userId} with where clause:`, JSON.stringify(whereClause, null, 2));
    }
    
    const payments = await this.prisma.payments.findMany({
      where: whereClause,
      include: {
        reservation: {
          include: {
            local: {
              include: {
                centre: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    this.logger.log(`Found ${payments.length} payments for user ${userId} with role ${userRole}`);
    this.logger.log('Filtered payments:', JSON.stringify(payments, null, 2));
    
    return payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      payment_method: 'stripe', // Par défaut, on utilise Stripe
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      reservation: payment.reservation ? {
        id: payment.reservation.id,
        objet: payment.reservation.objet,
        local: {
          nom: payment.reservation.local.nom
        },
        date_reservation: payment.reservation.date_reservation
      } : null,
      stripe_session_id: payment.stripe_session_id,
      stripe_payment_id: payment.stripe_payment_id
    }));
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
