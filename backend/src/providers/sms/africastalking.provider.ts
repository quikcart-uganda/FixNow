import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import type { SmsMessage, SmsProvider } from './types.js';

/**
 * Africa's Talking SMS — recommended for East Africa commercial OTP / alerts.
 * Requires AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME (optional AFRICASTALKING_FROM).
 */
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'africastalking';

  async send(message: SmsMessage): Promise<void> {
    const apiKey = env.AFRICASTALKING_API_KEY;
    const username = env.AFRICASTALKING_USERNAME;
    if (!apiKey || !username) {
      throw AppError.badRequest("Africa's Talking SMS is not configured (missing API key or username)");
    }

    const form = new URLSearchParams({
      username,
      to: message.to,
      message: message.body,
    });
    if (env.AFRICASTALKING_FROM) {
      form.set('from', env.AFRICASTALKING_FROM);
    }

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Africa's Talking SMS failed (${res.status}): ${text.slice(0, 240)}`);
    }
  }
}
