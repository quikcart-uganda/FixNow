import { env } from '../../config/env.js';
import { smsCircuit, CircuitOpenError } from '../../utils/circuitBreaker.js';
import { AfricasTalkingSmsProvider } from './africastalking.provider.js';
import { ConsoleSmsProvider } from './console.provider.js';
import { TwilioSmsProvider } from './twilio.provider.js';
import type { SmsMessage, SmsProvider } from './types.js';

export type { SmsMessage, SmsProvider } from './types.js';

let cached: SmsProvider | null = null;

function resolveProvider(): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'twilio':
      return new TwilioSmsProvider();
    case 'africastalking':
      return new AfricasTalkingSmsProvider();
    case 'console':
    default:
      return new ConsoleSmsProvider();
  }
}

export function getSmsProvider(): SmsProvider {
  if (!cached) {
    const inner = resolveProvider();
    cached = {
      get name() {
        return inner.name;
      },
      async send(message: SmsMessage) {
        try {
          await smsCircuit.exec(() => inner.send(message));
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            throw new Error('SMS delivery temporarily unavailable. Please try again shortly.');
          }
          throw err;
        }
      },
    };
  }
  return cached;
}

export function clearSmsProviderCache(): void {
  cached = null;
}
