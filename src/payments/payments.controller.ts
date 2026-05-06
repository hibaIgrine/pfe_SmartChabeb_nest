import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { KonnectService } from './konnect.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private konnect: KonnectService,
  ) {}

  @Post('create')
  async create(@Body() body: CreatePaymentDto) {
    const { reservationId, amount, returnUrl } = body as any;
    const result = await this.payments.createPaymentAndSession(
      reservationId,
      amount,
      returnUrl,
    );
    // Expect konnect session contains a redirect URL
    const checkoutUrl =
      result.checkoutUrl ??
      result.session?.url ??
      result.session?.checkout_url ??
      result.session?.redirect_url ??
      null;
    return { checkoutUrl, paymentId: result.payment.id };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('konnect-signature') signature: string,
  ) {
    const raw = (req as any).rawBody ?? JSON.stringify(req.body);

    const verified = this.konnect.verifyWebhookSignature(raw, signature);
    if (!verified) {
      return res.status(400).send({ ok: false, message: 'Invalid signature' });
    }

    const event = req.body;
    await this.payments.handleWebhookEvent(event);
    return res.send({ ok: true });
  }
}
