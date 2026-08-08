/**
 * Shared conversational intelligence inspired by QuikCart conversationalCore patterns.
 * Deterministic social short-circuits + focus inference + correction / reference hints.
 * Does not call LLMs and does not mutate marketplace state.
 */

export type SocialIntent = 'greeting' | 'goodbye' | 'thanks' | 'help' | 'small_talk' | '';

export type ConversationFocus =
  | 'find_technician'
  | 'quotations'
  | 'booking'
  | 'pricing'
  | 'payments_escrow'
  | 'tracking'
  | 'reviews_trust'
  | 'profile'
  | 'nearby_jobs'
  | 'earnings'
  | 'moderation'
  | 'analytics'
  | 'platform_faq'
  | 'general'
  | '';

const GREETING_EXACT = new Set([
  'hi',
  'hii',
  'hello',
  'hey',
  'heya',
  'hi there',
  'hello there',
  'hey there',
  'good morning',
  'good afternoon',
  'good evening',
  'morning',
  'gm',
]);

const GOODBYE_EXACT = new Set(['bye', 'goodbye', 'good bye', 'see you', 'see ya', 'later', 'take care']);

const THANKS_EXACT = new Set([
  'thanks',
  'thank you',
  'thank u',
  'thx',
  'ty',
  'thanks a lot',
  'thank you so much',
  'appreciated',
]);

const HELP_EXACT = new Set(['help', 'need help', 'i need help', 'help me', 'support', 'assist me', 'can you help']);

function compactText(value = '', limit = 220): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function normalizeSimpleMessage(value = ''): string {
  return compactText(value, 500)
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pickVariant(variants: string[], seed = ''): string {
  if (!variants.length) return '';
  let hash = 0;
  const text = String(seed || '');
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % 997;
  return variants[hash % variants.length]!;
}

export function detectSocialIntent(message = ''): SocialIntent {
  const normalized = normalizeSimpleMessage(message);
  if (!normalized) return '';
  const words = normalized.split(' ').filter(Boolean);
  if (GREETING_EXACT.has(normalized)) return 'greeting';
  if (words.length <= 4 && /^(hi+|hello+|hey+|yo+|hy)\b/.test(normalized)) return 'greeting';
  if (GOODBYE_EXACT.has(normalized) || /^(bye+|goodbye|see you|see ya|later)\b/.test(normalized)) return 'goodbye';
  if (THANKS_EXACT.has(normalized) || /^thank(s|\s+you)\b/.test(normalized)) return 'thanks';
  if (HELP_EXACT.has(normalized)) return 'help';
  if (
    words.length <= 6 &&
    (/^how (are|r) (you|u)\b/.test(normalized) ||
      /^how'?s it going\b/.test(normalized) ||
      /^what'?s up\b/.test(normalized))
  ) {
    return 'small_talk';
  }
  return '';
}

export function isCorrectionMessage(message = ''): boolean {
  const n = normalizeSimpleMessage(message);
  return /^(no|nope|not that|i meant|i mean|actually|wait|correction|instead)\b/.test(n);
}

export function isPlatformFaqMessage(message = ''): boolean {
  const n = normalizeSimpleMessage(message);
  return /\b(how does|what is|what'?s|explain|escrow|payment flow|job status|how do i|how to|verification|subscription|free jobs?|badge|reputation|trust score)\b/.test(
    n,
  );
}

export function inferConversationFocus(
  history: Array<{ role: string; content: string }> = [],
  options: { lastFocus?: string } = {},
): ConversationFocus {
  if (options.lastFocus) return options.lastFocus as ConversationFocus;
  const turns = history.slice(-8);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (!turn || turn.role !== 'assistant') continue;
    const text = compactText(turn.content, 400).toLowerCase();
    if (/escrow|payment|refund|payout|wallet/.test(text)) return 'payments_escrow';
    if (/quotation|quote|application|proposal/.test(text)) return 'quotations';
    if (/book|assign|accept|tomorrow|morning|schedule/.test(text)) return 'booking';
    if (/review|trust|reputation|badge|rating/.test(text)) return 'reviews_trust';
    if (/track|en route|in progress|status/.test(text)) return 'tracking';
    if (/technician|plumber|electrician|found|near/.test(text)) return 'find_technician';
    if (/price|cost|budget|ugx|charge/.test(text)) return 'pricing';
    if (/profile|headline|bio|availability/.test(text)) return 'profile';
    if (/nearby job|open job|lead/.test(text)) return 'nearby_jobs';
    if (/earning|payout/.test(text)) return 'earnings';
    if (/moderat|flag|suspend|lock/.test(text)) return 'moderation';
    if (/dashboard|metric|analytics|growth|platform/.test(text)) return 'analytics';
  }
  return '';
}

export function detectDomainFocus(message = '', role: 'customer' | 'technician' | 'admin'): ConversationFocus {
  const n = normalizeSimpleMessage(message);
  if (!n) return 'general';

  if (isPlatformFaqMessage(n)) return 'platform_faq';

  if (role === 'customer') {
    if (/\b(trust|review|rating|reputation|can i trust)\b/.test(n)) return 'reviews_trust';
    if (/\b(escrow|pay|payment|refund|wallet)\b/.test(n)) return 'payments_escrow';
    if (/\b(track|where is|en route|status|progress)\b/.test(n)) return 'tracking';
    if (/\b(quote|quotation|application|proposal)\b/.test(n)) return 'quotations';
    if (/\b(book|hire|assign|accept|tomorrow|morning|schedule)\b/.test(n)) return 'booking';
    if (/\b(price|cost|budget|how much|estimate|ugx)\b/.test(n)) return 'pricing';
    if (/\b(plumber|electrician|mechanic|technician|find|search|fix|sink|wiring|leak)\b/.test(n)) {
      return 'find_technician';
    }
  }

  if (role === 'technician') {
    if (/\b(earn|payout|wallet|escrow)\b/.test(n)) return 'earnings';
    if (/\b(profile|headline|bio|pricing|rate|availability)\b/.test(n)) return 'profile';
    if (/\b(nearby|job|lead|apply|quotation)\b/.test(n)) return 'nearby_jobs';
    if (/\b(review|trust|reputation|badge)\b/.test(n)) return 'reviews_trust';
  }

  if (role === 'admin') {
    if (/\b(moderat|flag|review|suspend|lock|verification)\b/.test(n)) return 'moderation';
    if (/\b(trust|risk|reputation)\b/.test(n)) return 'reviews_trust';
    if (/\b(escrow|payment|refund|payout|settlement)\b/.test(n)) return 'payments_escrow';
    if (/\b(analytics|metric|dashboard|growth|health|volume)\b/.test(n)) return 'analytics';
  }

  return 'general';
}

function firstName(displayName = ''): string {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || '';
}

export function socialShortCircuitReply(input: {
  social: SocialIntent;
  role: 'customer' | 'technician' | 'admin';
  displayName?: string;
  seed?: string;
}): string | null {
  const { social, role, displayName, seed = '' } = input;
  if (!social) return null;
  const name = firstName(displayName);

  if (social === 'greeting') {
    if (role === 'customer') {
      return pickVariant(
        [
          name
            ? `Hi ${name} — I'm your FixNow Assistant. I can help you find trusted technicians, compare services, estimate costs, explain quotations and guide you through bookings.`
            : `Hi — I'm your FixNow Assistant. I can help you find trusted technicians, compare services, estimate costs, explain quotations and guide you through bookings.`,
          name
            ? `Hey ${name}. Looking for a technician, a cost estimate, or booking help?`
            : `Hey. Looking for a technician, a cost estimate, or booking help?`,
        ],
        seed,
      );
    }
    if (role === 'technician') {
      return pickVariant(
        [
          `Welcome back${name ? ` ${name}` : ''} — I can help with nearby jobs, applications, profile, availability, pricing, earnings, and customer replies.`,
          `Hey${name ? ` ${name}` : ''}. Need help winning nearby jobs, strengthening your profile, or drafting a customer reply?`,
        ],
        seed,
      );
    }
    return pickVariant(
      [
        `Welcome back${name ? ` ${name}` : ''}. I can help you manage the FixNow platform, analyse activity and assist with moderation.`,
        `Hello${name ? ` ${name}` : ''}. Ask me for platform summaries, marketing ideas, or moderation guidance.`,
      ],
      seed,
    );
  }
  if (social === 'thanks') {
    return pickVariant(
      ['Happy to help.', 'Anytime — say if you need anything else on FixNow.', "You're welcome."],
      seed,
    );
  }
  if (social === 'goodbye') {
    return pickVariant(['Take care.', 'See you on FixNow.', 'Bye — I am here when you need me.'], seed);
  }
  if (social === 'small_talk') {
    return pickVariant(
      [
        "I'm doing well — ready when you are. What should we tackle on FixNow?",
        'All good here. What do you need help with?',
      ],
      seed,
    );
  }
  if (social === 'help') {
    if (role === 'customer') {
      return 'I can help you find technicians, understand quotations, prepare bookings, explain payments/escrow, and read reviews. What are you trying to do?';
    }
    if (role === 'technician') {
      return 'I can help with your profile, pricing ideas, nearby jobs, applications, earnings context, and customer communication drafts. Where should we start?';
    }
    return 'I can help interpret platform analytics, moderation queues, trust signals, and growth opportunities. What do you want to look at?';
  }
  return null;
}

export function buildMemoryGuidance(input: {
  message: string;
  focus: ConversationFocus;
  historyFocus: ConversationFocus;
  isCorrection: boolean;
}): string {
  const lines: string[] = [];
  if (input.isCorrection) {
    lines.push(
      'The user is correcting a previous assumption. Discard the wrong interpretation and continue with the corrected intent.',
    );
  }
  if (input.historyFocus && /\b(it|that|him|her|them|this one|the quote|earlier|previous|same)\b/i.test(input.message)) {
    lines.push(`Continue the prior conversation focus: ${input.historyFocus}. Resolve pronouns/references against that topic.`);
  }
  if (input.focus && input.focus !== 'general') {
    lines.push(`Current inferred focus: ${input.focus}.`);
  }
  return lines.join(' ');
}

export const SHARED_CONVERSATION_PROMPT_BLOCK = `
Acknowledge first, then help. Keep multi-turn context for pronouns and follow-ups.
Handle corrections without arguing. Ask one clarifying question when ambiguous.
Never invent FixNow data. Never claim marketplace actions completed. Plain text only.
`.trim();
