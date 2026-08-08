import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import type { SmsMessage, SmsProvider } from './types.js';

/**
 * Twilio Programmable SMS — commercial OTP / alerts.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  async send(message: SmsMessage): Promise<void> {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw AppError.badRequest('Twilio SMS is not configured (missing account SID, auth token, or from number)');
    }

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
      To: message.to,
      From: from,
      Body: message.body,
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Twilio SMS failed (${res.status}): ${text.slice(0, 240)}`);
    }
  }
}
