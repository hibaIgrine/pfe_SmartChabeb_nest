import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// `fetch` is used to call Konnect API. In Node.js 18+ global fetch exists.
// If your environment doesn't provide it, install a fetch polyfill (node-fetch) or enable lib.dom.
declare const fetch: any;

@Injectable()
export class KonnectService {
  /*
   IMPORTANT: Konnect integration requires setting environment variables in backend/.env:
     - KONNECT_BASE_URL
     - KONNECT_API_KEY
     - KONNECT_WEBHOOK_SECRET

   At development time you can leave these empty; the service will return a placeholder
   instead of calling the real Konnect API. When your Konnect account is ready, set
   the values and restart the backend.
  */
  private readonly logger = new Logger(KonnectService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('KONNECT_BASE_URL') || '';
    this.apiKey = this.config.get('KONNECT_API_KEY') || '';
    this.webhookSecret = this.config.get('KONNECT_WEBHOOK_SECRET') || '';
  }

  async createSession(amount: number, reference: string, returnUrl: string) {
    const payload = {
      amount,
      reference,
      return_url: returnUrl,
    };

    const url = `${this.baseUrl.replace(/\/+$/, '')}/checkout/sessions`;
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn(
        'Konnect not configured (KONNECT_BASE_URL or KONNECT_API_KEY missing). Skipping real API call.',
      );
      return { id: null, url: null };
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return data;
  }

  verifyWebhookSignature(rawBody: string, signatureHeader?: string) {
    if (!this.webhookSecret || !signatureHeader) return false;
    try {
      const hmac = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');
      const a = Buffer.from(hmac);
      const b = Buffer.from(signatureHeader);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err as any);
      return false;
    }
  }
}
