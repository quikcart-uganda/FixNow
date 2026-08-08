import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './types.js';

/**
 * Resend-ready stub. Configure RESEND_API_KEY to activate;
 * until then callers should not select this provider.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? 'FixNow <noreply@fixnow.app>',
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error(`[email:resend] failed ${res.status}: ${body}`);
      throw new Error('Failed to send email via Resend');
    }
  }
}
