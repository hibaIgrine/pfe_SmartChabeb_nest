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
    this.logger.debug(`Webhook event received: ${JSON.stringify(event)}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
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
    const payment = await this.prisma.payments.findFirst({
      where: { stripe_session_id: session.id },
    });

    if (!payment) {
      this.logger.warn('Payment not found for session id ' + session.id);
      return { ok: false };
    }

    await this.prisma.payments.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        stripe_payment_id: session.payment_intent,
      },
    });

    // Mark reservation as CONFIRMED
    try {
      await this.prisma.reservations_locaux.update({
        where: { id: payment.reservation_id },
        data: { statut: 'CONFIRME' },
      });
    } catch (err) {
      this.logger.warn(
        'Failed to update reservation status: ' + (err as any).message,
      );
    }
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
