/**
 * Email delivery provider interface.
 * Implementations: console (dev), Resend, SMTP — selected via env.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
