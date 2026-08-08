import { env } from '../../config/env.js';
import { emailCircuit, CircuitOpenError } from '../../utils/circuitBreaker.js';
import { ConsoleEmailProvider } from './console.provider.js';
import { ResendEmailProvider } from './resend.provider.js';
import { SmtpEmailProvider } from './smtp.provider.js';
import type { EmailMessage, EmailProvider } from './types.js';

export type { EmailMessage, EmailProvider } from './types.js';

let cached: EmailProvider | null = null;
let cachedName: string | null = null;

async function resolveEmailId(): Promise<string> {
  try {
    const { providerManager } = await import('../../services/providers/provider.manager.js');
    return providerManager.resolveRuntimeId('email');
  } catch {
    return env.EMAIL_PROVIDER || 'console';
  }
}

function resolveProvider(id?: string): EmailProvider {
  const providerId = id || env.EMAIL_PROVIDER || 'console';
  switch (providerId) {
    case 'resend':
      if (!env.RESEND_API_KEY) return new ConsoleEmailProvider();
      return new ResendEmailProvider(env.RESEND_API_KEY);
    case 'smtp':
      return new SmtpEmailProvider();
    case 'none':
    case 'console':
    default:
      return new ConsoleEmailProvider();
  }
}

/** Circuit-wrapped email provider — fails fast when the outbound channel is unhealthy. */
export function getEmailProvider(): EmailProvider {
  if (!cached) {
    const inner = resolveProvider();
    cachedName = inner.name;
    cached = {
      get name() {
        return inner.name;
      },
      async send(message: EmailMessage) {
        try {
          // Refresh selection when possible without blocking first send path forever
          void resolveEmailId().then((id) => {
            if (id !== cachedName && id !== 'console') {
              clearEmailProviderCache();
            }
          });
          await emailCircuit.exec(() => inner.send(message));
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            throw new Error('Email delivery temporarily unavailable. Please try again shortly.');
          }
          throw err;
        }
      },
    };
  }
  return cached;
}

export function clearEmailProviderCache(): void {
  cached = null;
  cachedName = null;
}
