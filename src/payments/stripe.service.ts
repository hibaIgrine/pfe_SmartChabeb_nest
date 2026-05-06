import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe, { Stripe as StripeType } from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: StripeType;

  constructor(private config: ConfigService) {
    const secretKey = this.config.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-06-20' as any,
    });
  }

  async createCheckoutSession(amount: number, reference: string, returnUrl: string) {
    try {
      // Convertir TND vers USD (taux approximatif : 1 TND ≈ 0.32 USD)
      const amountInUSD = Math.round(amount * 0.32 * 100); // Convertir en cents USD
      
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd', // Convertir TND vers USD pour Stripe
              product_data: {
                name: `Réservation locale - ${reference}`,
                description: `Paiement pour réservation de local (${amount} TND ≈ ${(amount * 0.32).toFixed(2)} USD)`,
              },
              unit_amount: amountInUSD, // Montant en cents USD
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnUrl}?cancelled=true`,
        metadata: {
          reference,
        },
      });

      return { id: session.id, url: session.url };
    } catch (error) {
      this.logger.error('Failed to create Stripe session', error);
      throw error;
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) return false;

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
      return true;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', error);
      return false;
    }
  }

  async retrieveSession(sessionId: string): Promise<any> {
    return await this.stripe.checkout.sessions.retrieve(sessionId);
  }
}
