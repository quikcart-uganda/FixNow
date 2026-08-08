import { logger } from '../../config/logger.js';
import { getCachedDevControls } from '../../services/platform/devControls.service.js';
import type { SmsMessage, SmsProvider } from './types.js';

/** Masks OTP-shaped digit runs so verification codes never reach the logs. */
function redactCodes(text: string): string {
  return text.replace(/\b\d{4,8}\b/g, (match) => '*'.repeat(match.length));
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  async send(message: SmsMessage): Promise<void> {
    const body = getCachedDevControls().enableDebugLogs ? message.body : redactCodes(message.body);
    logger.info(`[sms:${this.name}] to=${message.to} body=${body}`);
  }
}
