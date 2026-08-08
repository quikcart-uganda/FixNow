import { logger } from '../../config/logger.js';
import { getCachedDevControls } from '../../services/platform/devControls.service.js';
import type { EmailMessage, EmailProvider } from './types.js';

/** Masks OTP-shaped digit runs so verification codes never reach the logs. */
function redactCodes(text: string): string {
  return text.replace(/\b\d{4,8}\b/g, (match) => '*'.repeat(match.length));
}

/** Development / fallback provider — logs instead of sending. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    logger.info(`[email:${this.name}] to=${message.to} subject=${message.subject}`);
    const debugLogsAllowed = getCachedDevControls().enableDebugLogs;
    logger.debug(debugLogsAllowed ? message.text : redactCodes(message.text));
  }
}
