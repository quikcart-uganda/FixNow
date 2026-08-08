import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './types.js';

function resolveAuth(): { user: string; pass: string } | undefined {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASSWORD || env.SMTP_PASS;
  if (user && pass) return { user, pass };
  return undefined;
}

/**
 * SMTP email provider — uses SMTP_* env configuration.
 * Selected when EMAIL_PROVIDER=smtp.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      if (!env.SMTP_HOST) {
        throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
      }
      const port = env.SMTP_PORT ?? 587;
      const secure = env.SMTP_SECURE ?? port === 465;
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure,
        auth: resolveAuth(),
        ignoreTLS: env.SMTP_IGNORE_TLS === true,
        connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS ?? 10_000,
        greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS ?? 10_000,
        tls: { rejectUnauthorized: env.isProduction },
      });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!env.SMTP_HOST) {
      logger.warn(`[email:smtp] SMTP_HOST missing — skipping send to ${message.to}`);
      return;
    }

    const from = env.SMTP_FROM || env.EMAIL_FROM || 'FixNow <noreply@fixnow.app>';
    try {
      const info = await this.getTransporter().sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: env.SMTP_REPLY_TO || undefined,
      });
      logger.info(`[email:smtp] sent messageId=${info.messageId} to=${message.to}`);
    } catch (err) {
      logger.error('[email:smtp] send failed', {
        to: message.to,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error('Failed to send email via SMTP');
    }
  }
}
