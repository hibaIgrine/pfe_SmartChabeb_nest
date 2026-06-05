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

  @Get('admin/centre-revenues')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async getCentreRevenues(
    @Query('scope') scope?: string,
    @Query('month') month?: string,
  ) {
    return await this.payments.getAdminCentreRevenueOverview(scope, month);
  }

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
