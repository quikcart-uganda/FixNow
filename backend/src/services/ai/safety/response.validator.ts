/**
 * Pre- and post-LLM safety for the FixNow AI subsystem.
 * Prompt hardening is not enough — this layer validates and sanitizes outputs.
 */

const CLAIMED_ACTION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(i('ve| have)? (just )?(posted|booked|hired|assigned|accepted|applied|paid|released|refunded|suspended|deleted|unlocked|verified)\b)/i, label: 'claimed_mutation' },
  { re: /\b(payment (has been|was) (released|sent|completed)|escrow (has been|was) released)\b/i, label: 'claimed_escrow' },
  { re: /\b(i (suspended|banned|locked|deleted) (the )?(user|technician|customer|account))\b/i, label: 'claimed_admin_action' },
  { re: /\b(job (is|was) now (posted|assigned|completed)|i (created|cancelled) (the )?job)\b/i, label: 'claimed_job_change' },
];

const LEAK_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /\b(sk-[A-Za-z0-9_-]{10,})\b/g, replacement: '[redacted]' },
  { re: /\b(AIza[0-9A-Za-z_-]{10,})\b/g, replacement: '[redacted]' },
  { re: /\b(mongodb(\+srv)?:\/\/[^\s]+)/gi, replacement: '[redacted-db]' },
  { re: /\b(Bearer\s+[A-Za-z0-9._-]{10,})\b/gi, replacement: '[redacted-token]' },
  { re: /\b(system prompt|developer prompt|raw prompt|hidden (endpoint|instructions?)|internal (api|notes?)|database schema|grounding (text|prompt)|tool instructions?)\b/gi, replacement: 'platform details' },
  { re: /\b(Ground your answer here|Safe FixNow tool results|do not invent beyond this|Safe tool result)\b/gi, replacement: '' },
  { re: /```[\s\S]*?```/g, replacement: '' },
  { re: /\b(stack trace|TypeError:|MongoServerError|ECONNREFUSED|ENOTFOUND|AbortError)\b/gi, replacement: 'technical detail' },
  { re: /\b(OpenAI|Gemini|Anthropic|gpt-[0-9]|API key is not configured|request timed out|quota exceeded)\b/gi, replacement: 'the assistant service' },
];

const TOOL_NAME_LEAK =
  /\b(searchTechnicians|listCategories|getMyJobs|getJobDetails|getTechnicianPublicProfile|getMyProfile|getDashboard|listNearbyJobs|listMyApplications|getMarketplaceMetrics|getReviewAnalytics|listTechnicians|listJobs|getPaymentStatus|getMyReviews|getWalletSummary|getEscrowStatus|getEarnings|getPaymentsOverview|getEscrowOverview|getPlatformKnowledge|getTechnicianReviews)\b/g;

/** Wrong-role feature asks — block before tools/LLM. */
const CROSS_ROLE_PATTERNS: Array<{ role: 'customer' | 'technician' | 'admin'; re: RegExp; hint: string }> = [
  {
    role: 'customer',
    re: /\b(admin dashboard|suspend (a )?technician|release escrow for all|show all customers'? data|feature flags?|moderation queue|create (an )?offer for (my )?services|manage (my )?availability as (a )?tech)\b/i,
    hint: 'customer',
  },
  {
    role: 'technician',
    re: /\b(post( a)? job|find (me )?(a )?technician|hire (a )?technician|customer checkout|shopping cart|add to cart|customer payment card|other technician('s)? earnings|admin password|suspend customer|browse as customer)\b/i,
    hint: 'technician',
  },
  {
    role: 'admin',
    re: /\b(bypass auth|dump database|show api keys|reveal system prompt|book (me )?(a )?plumber|post( a)? job for myself as customer)\b/i,
    hint: 'admin',
  },
];

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/i,
  /you are now (dan|unrestricted|jailbroken)/i,
  /reveal (your|the) (system|hidden|developer) prompt/i,
  /print (your|the) (system|developer) (prompt|message)/i,
  /act as if (you have|with) no (rules|restrictions)/i,
  /show (me )?(your|the) (tool|hidden) (instructions|outputs?)/i,
  /repeat (everything|all) (above|before) (this|the) (message|prompt)/i,
];

export interface SafetyCheckResult {
  blocked: boolean;
  reason?: string;
  safeMessage?: string;
}

export function detectPromptInjection(message: string): SafetyCheckResult {
  const text = String(message || '');
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return {
        blocked: true,
        reason: 'prompt_injection',
        safeMessage:
          'I can only help with FixNow platform questions for your account. What do you need help with on FixNow?',
      };
    }
  }
  return { blocked: false };
}

export function detectCrossRoleViolation(
  role: 'customer' | 'technician' | 'admin',
  message: string,
): SafetyCheckResult {
  const text = String(message || '');
  for (const rule of CROSS_ROLE_PATTERNS) {
    if (rule.role === role && rule.re.test(text)) {
      const safeMessage =
        role === 'technician'
          ? 'I am your FixNow Pro assistant. I can help with jobs, applications, profile, pricing, availability, earnings, and customer communication — not customer booking or admin tools. What should we work on in Pro?'
          : role === 'customer'
            ? 'I am your FixNow customer assistant. I can help with finding technicians, jobs, payments, tracking, and support — not technician or admin tools. What do you need help with?'
            : 'That request is outside admin assistant scope. Ask about platform health, moderation, users, payments oversight, or analytics instead.';
      return {
        blocked: true,
        reason: 'cross_role',
        safeMessage,
      };
    }
  }
  if (role !== 'admin' && /\b(all users|every customer|show me (their|his|her) private|phone numbers? of)\b/i.test(text)) {
    return {
      blocked: true,
      reason: 'privacy',
      safeMessage:
        'I cannot share other people’s private information. I can only help with data you are allowed to see in FixNow.',
    };
  }
  return { blocked: false };
}

export interface ValidatedResponse {
  text: string;
  mutated: boolean;
  flags: string[];
}

function applyGlobalReplace(text: string, re: RegExp, replacement: string): { text: string; hit: boolean } {
  // Reset lastIndex so /g patterns never skip matches after .test()
  re.lastIndex = 0;
  if (!re.test(text)) {
    re.lastIndex = 0;
    return { text, hit: false };
  }
  re.lastIndex = 0;
  return { text: text.replace(re, replacement), hit: true };
}

export function sanitizeAndValidateResponse(raw: string): ValidatedResponse {
  let text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim();
  const flags: string[] = [];

  for (const { re, replacement } of LEAK_PATTERNS) {
    const result = applyGlobalReplace(text, re, replacement);
    text = result.text;
    if (result.hit) flags.push('leak_redacted');
  }

  {
    const result = applyGlobalReplace(text, TOOL_NAME_LEAK, 'FixNow data');
    text = result.text;
    if (result.hit) flags.push('tool_name_stripped');
  }

  let claimed = false;
  for (const { re, label } of CLAIMED_ACTION_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      claimed = true;
      flags.push(label);
      break;
    }
  }

  if (claimed) {
    text =
      'I can guide you, but I cannot perform marketplace actions myself. Use the FixNow screens to complete that step — I can walk you through exactly where to go.';
  }

  text = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 4000);

  if (!text) {
    text =
      'I could not produce a safe answer just now. Try asking again, or use the normal FixNow screens for this step.';
    flags.push('empty_fallback');
  }

  return { text, mutated: flags.length > 0, flags };
}

export function publicToolLabel(tool: string): string {
  const map: Record<string, string> = {
    searchTechnicians: 'Technician search',
    listCategories: 'Service categories',
    getMyJobs: 'Your jobs',
    getJobDetails: 'Job details',
    getTechnicianPublicProfile: 'Technician profile',
    getMyProfile: 'Your profile',
    getDashboard: 'Dashboard',
    listNearbyJobs: 'Nearby jobs',
    listMyApplications: 'Your applications',
    getMarketplaceMetrics: 'Marketplace metrics',
    getReviewAnalytics: 'Review analytics',
    listTechnicians: 'Technicians',
    listJobs: 'Jobs',
    getPaymentStatus: 'Payment status',
    getEscrowStatus: 'Escrow status',
    getWalletSummary: 'Wallet',
    getMyReviews: 'Reviews',
    getEarnings: 'Earnings',
    getPaymentsOverview: 'Payments overview',
    getEscrowOverview: 'Escrow overview',
    getPlatformKnowledge: 'Platform guide',
    getTechnicianReviews: 'Technician reviews',
    navigateToScreen: 'Navigation',
    getWorkflowMap: 'Workflow map',
    prepareCreateJob: 'Prepare job',
    prepareCancelJob: 'Prepare cancellation',
    prepareAvailabilityUpdate: 'Prepare availability',
    guideSubscriptionUpgrade: 'Subscription guide',
    guideCreateOffer: 'Offer guide',
  };
  return map[tool] || 'FixNow data';
}
