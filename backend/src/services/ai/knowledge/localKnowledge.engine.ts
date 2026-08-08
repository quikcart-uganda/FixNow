/**
 * Built-in FixNow knowledge layer — answers common platform questions without an LLM.
 * Role-scoped: never suggests another portal's workflows.
 */

import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import type { SafeAiRoleContext } from '../context/context.manager.js';
import type { AiToolResult } from '../tools/types.js';

export type LocalKnowledgeHit = {
  answered: boolean;
  text: string;
  topic: string;
  /** True when the request needs deeper LLM reasoning beyond local guidance. */
  needsAdvanced?: boolean;
};

type FaqEntry = {
  id: string;
  roles: AiAssistantRole[] | 'all';
  match: RegExp;
  answer: (ctx: { role: AiAssistantRole; displayName?: string }) => string;
};

const FAQ: FaqEntry[] = [
  {
    id: 'escrow',
    roles: 'all',
    match: /\b(escrow|how (do|does) (payment|pay)|payment protection|held (in )?(payment|funds)|release (funds|payment))\b/i,
    answer: ({ role }) => {
      if (role === 'customer') {
        return 'FixNow escrow holds your payment securely after you pay for a booked job. The technician is paid when work is completed and confirmed — not before. You pay in FixNow (for example mobile money), funds stay protected, then release follows completion rules. Open My Jobs → the job → Payments if you need the live status.';
      }
      if (role === 'technician') {
        return 'Customer payments are held in escrow until the job is completed and confirmed. You do not receive payout until release rules are met. Check Earnings and the job’s escrow status in FixNow Pro — never ask customers to pay outside the app.';
      }
      return 'Escrow holds customer funds for a job until completion/confirmation (or dispute/refund flows). Admins oversee payments & escrow in the admin Payments screens — never release funds via chat.';
    },
  },
  {
    id: 'booking_flow',
    roles: ['customer'],
    match: /\b(how (do i |to )?(book|hire|post)|booking (flow|steps)|post( a)? job)\b/i,
    answer: () =>
      'To book on FixNow: (1) Post a job or search a technician, (2) review applications/quotations, (3) accept a technician, (4) pay into escrow, (5) track the job, (6) confirm completion, (7) leave a review. I can explain any step — use Post a job or Search to start.',
  },
  {
    id: 'apply_jobs',
    roles: ['technician'],
    match: /\b(how (do i |to )?apply|nearby jobs?|win (more )?jobs?|find (work|leads))\b/i,
    answer: () =>
      'Open Nearby jobs in FixNow Pro, filter by category and area, then apply with a clear quotation and timeline. Strong profiles, fast replies, and accurate pricing win more work. Keep availability and operating areas up to date so leads match you.',
  },
  {
    id: 'profile_tips',
    roles: ['technician'],
    match: /\b(improve (my )?profile|complete (my )?profile|profile (tips|strength|quality)|headline|bio|portfolio|certificat)\b/i,
    answer: () =>
      'A strong FixNow Pro profile usually needs: clear headline, service categories, operating areas, availability, verified details, portfolio photos of real completed work, and certifications. Open Settings / Profile, fill gaps, and upload portfolio images. Ask me for a headline or bio draft once the AI writing service is available — or start from Nearby jobs and Profile screens now.',
  },
  {
    id: 'availability',
    roles: ['technician'],
    match: /\b(availability|set (my )?hours|schedule|when i'?m free)\b/i,
    answer: () =>
      'Update availability in FixNow Pro so customers see when you can take jobs. Accurate hours and service areas improve matching. Open Settings / availability, set your working days and times, then save. I cannot change availability for you — use that screen to confirm.',
  },
  {
    id: 'pricing_tips',
    roles: ['technician'],
    match: /\b(pricing|price (tips|strategy)|how (much|to) (charge|price)|quotation tips|write (a )?(better )?offer)\b/i,
    answer: () =>
      'Price from scope, materials, travel, and urgency. In quotations: list what is included, what is excluded, timeline, and any site-visit fee. Avoid undercutting so low you cannot deliver quality. Compare similar nearby jobs, then adjust. Draft the quote in the application screen — I only advise.',
  },
  {
    id: 'customer_comms',
    roles: ['technician'],
    match: /\b(reply to customer|customer (message|chat|communication)|professional (reply|response)|etiquette)\b/i,
    answer: () =>
      'Reply promptly, confirm understanding of the issue, state next steps and timing, and keep payment talk inside FixNow. Example tone: thank them, confirm the service and location, share ETA or quote next step, invite one clarifying question. Use job chat in FixNow Pro to send the message yourself.',
  },
  {
    id: 'ratings',
    roles: ['technician'],
    match: /\b(ratings?|reviews?|trust score|reputation|ask for review)\b/i,
    answer: () =>
      'Ratings improve when you communicate clearly, arrive on time, and finish cleanly. After completion, politely ask customers to leave a review in FixNow. Check My reviews for feedback themes. Never invent scores — live ratings come from the Reviews screens.',
  },
  {
    id: 'earnings',
    roles: ['technician'],
    match: /\b(earnings?|payout|when (do i|will i) get paid|wallet)\b/i,
    answer: () =>
      'Earnings appear after escrow release on completed jobs. Open Earnings in FixNow Pro for balances and payout options. Disputes can delay release — resolve those in the job screens. I cannot trigger payouts; use Earnings to request them when available.',
  },
  {
    id: 'payments_customer',
    roles: ['customer'],
    match: /\b(how (do i |to )?pay|payment (flow|steps)|mobile money|momo)\b/i,
    answer: () =>
      'After you accept a technician, open the job and follow Pay / escrow. Supported methods (such as mobile money) appear in the payment screen. Funds are held until work is confirmed. Never send money outside FixNow for marketplace jobs.',
  },
  {
    id: 'tracking',
    roles: ['customer'],
    match: /\b(track|where is (my )?technician|job status|en route)\b/i,
    answer: () =>
      'Open My Jobs or the active job tracking screen to see status (assigned, en route, in progress, awaiting confirmation). Use job chat for updates. Live location and status come from that screen — ask me if a status label is unclear.',
  },
  {
    id: 'applications_customer',
    roles: ['customer'],
    match: /\b(applications?|quotations?|compare (technicians|quotes)|which (tech|technician))\b/i,
    answer: () =>
      'Open your job to review applications. Compare price, trust signals, reviews, and response quality — not only the lowest quote. Accept one technician in that screen, then continue to payment.',
  },
  {
    id: 'verification',
    roles: 'all',
    match: /\b(verif(y|ication)|how (do i |to )?get verified|badge)\b/i,
    answer: ({ role }) => {
      if (role === 'technician') {
        return 'Verification unlocks fuller marketplace access. Complete profile details, upload required documents/certificates, and follow the Verification prompts in FixNow Pro. Admins review submissions — I cannot approve verification in chat.';
      }
      if (role === 'admin') {
        return 'Technician verification is handled in admin verification / trust queues. Review documents, approve or reject in those screens — never via assistant chat.';
      }
      return 'Verified technicians have completed FixNow’s verification checks. Prefer verified pros when trust matters. You can see verification badges on public profiles.';
    },
  },
  {
    id: 'notifications',
    roles: 'all',
    match: /\b(notification|alert|why (did|do) i get|push)\b/i,
    answer: () =>
      'FixNow notifications cover job updates, applications, payments, escrow, and reviews. Manage preferences in Settings / Notifications. I cannot send or silence notifications for you from chat.',
  },
  {
    id: 'nav_customer',
    roles: ['customer'],
    match: /\b(where (is|do i)|how (do i |to )?(find|open)|navigate|menu)\b/i,
    answer: () =>
      'Customer shortcuts: Home, Search, Post a job, My Jobs (track & applications), Chat, Payments on the job, Profile & Help. Tell me what you want to do and I will point to the right screen.',
  },
  {
    id: 'nav_technician',
    roles: ['technician'],
    match: /\b(where (is|do i)|how (do i |to )?(find|open)|navigate|menu)\b/i,
    answer: () =>
      'Pro shortcuts: Dashboard, Nearby jobs, Applications, Bookings/schedule, Earnings, Profile/Settings, Portfolio, Chat. Say what you need (jobs, profile, earnings) and I will guide you there.',
  },
  {
    id: 'nav_admin',
    roles: ['admin'],
    match: /\b(where (is|do i)|how (do i |to )?(find|open)|navigate|menu|platform health)\b/i,
    answer: () =>
      'Admin shortcuts: Dashboard (health), Users/Technicians, Jobs, Payments & Escrow, Marketing/CMS, Reviews/moderation, Verifications, Disputes, Analytics, Settings/feature flags, Audit logs. Ask which queue you need.',
  },
  {
    id: 'safety_tech',
    roles: ['technician'],
    match: /\b(safety|site safety|ppe|accident)\b/i,
    answer: () =>
      'Prioritise site safety: confirm scope on arrival, use appropriate PPE, decline unsafe work, and document issues in job chat with photos. Escalate disputes through FixNow rather than off-platform arrangements.',
  },
  {
    id: 'moderation_admin',
    roles: ['admin'],
    match: /\b(moderat|dispute|fraud|approval|pending verification)\b/i,
    answer: () =>
      'Use admin queues for moderation, disputes, fraud review, and verifications. Prioritise safety and payment integrity. The assistant can summarise what to inspect — all actions happen in admin tools, never here.',
  },
];

const ADVANCED_REQUEST =
  /\b(strateg(y|ise|ize)|business plan|legal advice|contract|lawsuit|write (a )?(long |detailed )?(essay|article|blog)|rewrite (this|my) (entire|whole)|deep analysis|industry expert|negotiate (a )?contract)\b/i;

export function isAdvancedAiRequest(message: string): boolean {
  return ADVANCED_REQUEST.test(String(message || ''));
}

/** Prefer local for FAQs / navigation / simple how-tos; send writing & complex reasoning to provider. */
export function shouldPreferLocalKnowledge(message: string): boolean {
  const text = String(message || '');
  if (isAdvancedAiRequest(text)) return false;
  if (
    /\b(draft|rewrite|rephrase|write (me |a )?(bio|headline|offer|reply|message|email|proposal)|coach me|summarise|summarize|analyse|analyze)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\b(how (do|does|to|can)|what (is|are|'s)|where (do|can|is)|explain|help (me )?(with|understand)|guide|steps?|tips?)\b/i.test(
      text,
    ) || FAQ.some((f) => f.match.test(text))
  );
}

function roleAllows(entry: FaqEntry, role: AiAssistantRole): boolean {
  return entry.roles === 'all' || entry.roles.includes(role);
}

/**
 * Resolve a local answer. Optionally enrich with tool summaries when present.
 */
export function answerFromLocalKnowledge(
  role: AiAssistantRole,
  message: string,
  options: {
    context?: SafeAiRoleContext;
    toolResults?: AiToolResult[];
  } = {},
): LocalKnowledgeHit | null {
  const text = String(message || '').trim();
  if (!text) return null;

  if (isAdvancedAiRequest(text)) {
    return {
      answered: true,
      needsAdvanced: true,
      topic: 'advanced',
      text: softAdvancedUnavailable(role),
    };
  }

  for (const entry of FAQ) {
    if (!roleAllows(entry, role)) continue;
    if (!entry.match.test(text)) continue;
    return {
      answered: true,
      topic: entry.id,
      text: entry.answer({ role, displayName: options.context?.displayName }),
    };
  }

  // Contextual technician nudges from tool summaries (no invention)
  if (role === 'technician' && options.toolResults?.length) {
    const profile = options.toolResults.find((t) => t.tool === 'getMyProfile' && t.ok);
    if (profile && /\b(profile|portfolio|availability)\b/i.test(text)) {
      return {
        answered: true,
        topic: 'profile_context',
        text: `${profile.summary} Use Profile and Portfolio in FixNow Pro to update anything that looks incomplete — I only guide; you confirm changes on those screens.`,
      };
    }
    const nearby = options.toolResults.find((t) => t.tool === 'listNearbyJobs' && t.ok);
    if (nearby && /\b(job|nearby|apply)\b/i.test(text)) {
      return {
        answered: true,
        topic: 'nearby_context',
        text: `${nearby.summary} Open Nearby jobs to review and apply with a clear quotation.`,
      };
    }
  }

  return null;
}

export function softAdvancedUnavailable(role: AiAssistantRole): string {
  if (role === 'technician') {
    return 'I can help with general FixNow Pro guidance using built-in knowledge — profile tips, nearby jobs, pricing basics, and customer communication. For deeper personalised coaching or long-form drafts, the AI writing service needs to be available. Please try again shortly, or continue in Profile, Nearby jobs, and Earnings.';
  }
  if (role === 'admin') {
    return 'I can still help with FixNow ops navigation and standard workflows. For deeper analysis or generated content, the AI service is temporarily unavailable — try again shortly, or use Dashboard, Moderation, and Analytics screens.';
  }
  return 'I can still help with FixNow features and general guidance. For deeper personalised assistance, the AI service is temporarily unavailable. Please try again shortly.';
}

export function softProviderUnavailable(role: AiAssistantRole): string {
  return softAdvancedUnavailable(role);
}
