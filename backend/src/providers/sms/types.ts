/**
 * SMS delivery provider interface.
 * Implementations: console (dev), twilio, africastalking — selected via SMS_PROVIDER.
 */
export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}
