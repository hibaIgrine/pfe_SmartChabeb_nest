import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KonnectService } from './konnect.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private konnect: KonnectService,
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

    // Create Konnect session
    const session: any = await this.konnect.createSession(
      amount,
      payment.id,
      returnUrl,
    );

    // Extract checkout URL from Konnect response (provider fields may vary)
    const checkoutUrl =
      session?.url ?? session?.checkout_url ?? session?.redirect_url ?? null;

    // Save session id returned by Konnect if any
    await this.prisma.payments.update({
      where: { id: payment.id },
      data: { konnect_session_id: session?.id ?? session?.session_id ?? null },
    });

    return { payment, session, checkoutUrl };
  }

  async handleWebhookEvent(event: any) {
    // Minimal handler: expects event.object or event.type containing session/payment info
    this.logger.debug(`Webhook event received: ${JSON.stringify(event)}`);
    const maybeSessionId =
      event.data?.session_id ?? event.data?.id ?? event.id ?? null;
    const status = event.data?.status ?? event.status ?? event.type ?? null;

    if (!maybeSessionId) return { ok: false };

    // Try to find payment by konnect_session_id or konnect_payment_id
    const payment = await this.prisma.payments.findFirst({
      where: { konnect_session_id: maybeSessionId },
    });

    if (!payment) {
      this.logger.warn('Payment not found for session id ' + maybeSessionId);
      return { ok: false };
    }

    const newStatus = /paid|success|completed|PAID/i.test(String(status))
      ? 'PAID'
      : /failed|cancel/i.test(String(status))
        ? 'FAILED'
        : 'PENDING';

    await this.prisma.payments.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        konnect_payment_id: event.data?.payment_id ?? null,
      },
    });

    if (newStatus === 'PAID') {
      // Mark reservation as CONFIRMED (if applicable)
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

    return { ok: true };
  }
}
