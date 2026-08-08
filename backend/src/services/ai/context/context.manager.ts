import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { User } from '../../../models/index.js';

export interface AiChatContextInput {
  screen?: string;
  jobId?: string;
  technicianId?: string;
  categoryId?: string;
  district?: string;
  query?: string;
  budgetMin?: number;
  budgetMax?: number;
  [key: string]: unknown;
}

export interface SafeAiRoleContext {
  role: AiAssistantRole;
  userId: string;
  displayName: string;
  /** Content environment — sandbox conversations must not drive production writes. */
  dataEnvironment: 'production' | 'sandbox' | 'development' | 'demo' | 'archived';
  /** production subscription/profile vs temporary Developer Preview session */
  subscriptionSource: 'production' | 'developer_preview';
  previewActive: boolean;
  previewPlanCode?: string;
  seedPlatform?: boolean;
  sandboxAccount: boolean;
  /** Platform operating mode — Development | Production (not dataEnvironment). */
  platformMode: 'development' | 'production';
  developerUxVisible: boolean;
  launchReady?: boolean;
  readinessOverallPercent?: number;
  screen?: string;
  jobId?: string;
  technicianId?: string;
  categoryId?: string;
  district?: string;
  query?: string;
  budgetMin?: number;
  budgetMax?: number;
  /** Optional live location for recommendation engine (never invent coordinates). */
  lat?: number;
  lng?: number;
  inputMode?: string;
  attachmentCount?: number;
  attachmentKinds?: string[];
  attachmentNames?: string[];
}

function compact(value: unknown, max = 120): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Builds a secret-free, role-scoped context object for prompts.
 * Marketplace live state still comes from tools — this only grounds the conversation.
 */
export async function buildRoleContext(
  role: AiAssistantRole,
  userId: string,
  input: AiChatContextInput = {},
  options: { guest?: boolean } = {},
): Promise<SafeAiRoleContext> {
  let displayName = 'User';
  let dataEnvironment: SafeAiRoleContext['dataEnvironment'] = 'production';
  let subscriptionSource: SafeAiRoleContext['subscriptionSource'] = 'production';
  let previewActive = false;
  let previewPlanCode: string | undefined;
  let seedPlatform = false;
  let sandboxAccount = false;
  let platformMode: SafeAiRoleContext['platformMode'] = 'development';
  let developerUxVisible = true;
  let launchReady: boolean | undefined;
  let readinessOverallPercent: number | undefined;
  try {
    const { getCurrentPlatformMode, isDeveloperUxVisible } = await import(
      '../../platform/platformMode.service.js'
    );
    platformMode = await getCurrentPlatformMode();
    developerUxVisible = await isDeveloperUxVisible();
    if (role === 'admin') {
      const { evaluateProductionReadiness } = await import(
        '../../platform/productionReadiness.service.js'
      );
      const readiness = await evaluateProductionReadiness();
      launchReady = readiness.canLaunch;
      readinessOverallPercent = readiness.overallPercent;
    }
  } catch {
    /* defaults */
  }
  if (options.guest) {
    displayName = 'Guest';
  } else {
    const user = await User.findById(userId).select('fullName email role dataEnvironment metadata').lean();
    displayName = compact(user?.fullName || user?.email || 'User', 80);
    const tagged = (user as { dataEnvironment?: string } | null)?.dataEnvironment;
    if (
      tagged === 'sandbox' ||
      tagged === 'development' ||
      tagged === 'demo' ||
      tagged === 'archived' ||
      tagged === 'production'
    ) {
      dataEnvironment = tagged;
    }
    const meta = (user?.metadata || {}) as { seedTag?: string; developer?: boolean };
    seedPlatform = meta.seedTag === 'fixnow-seed-platform-v1' || Boolean(meta.developer);
    sandboxAccount = dataEnvironment !== 'production';

    if (role === 'technician') {
      try {
        const { resolveEntitlements } = await import('../../marketplace/entitlements.service.js');
        const ent = await resolveEntitlements(userId);
        subscriptionSource = ent.subscriptionSource;
        previewActive = Boolean(ent.preview?.active);
        previewPlanCode = ent.preview?.planCode || ent.planCode || undefined;
      } catch {
        /* keep production defaults */
      }
    }
  }
  const screen = compact(input.screen, 80) || undefined;
  const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];
  const attachmentMeta = rawAttachments
    .slice(0, 4)
    .map((item) => {
      const row = item as { kind?: unknown; name?: unknown };
      return {
        kind: compact(row.kind, 40) || 'file',
        name: compact(row.name, 80) || 'attachment',
      };
    })
    .filter((a) => a.name);

  return {
    role,
    userId: options.guest ? `guest:${compact(userId, 40) || 'anon'}` : userId,
    displayName,
    dataEnvironment,
    subscriptionSource,
    previewActive,
    previewPlanCode,
    seedPlatform,
    sandboxAccount,
    platformMode,
    developerUxVisible,
    launchReady,
    readinessOverallPercent,
    screen,
    jobId: options.guest ? undefined : compact(input.jobId, 40) || undefined,
    technicianId: compact(input.technicianId, 40) || undefined,
    categoryId: compact(input.categoryId, 40) || undefined,
    district: compact(input.district, 80) || undefined,
    query: compact(input.query, 200) || undefined,
    budgetMin: typeof input.budgetMin === 'number' ? input.budgetMin : undefined,
    budgetMax: typeof input.budgetMax === 'number' ? input.budgetMax : undefined,
    lat: typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : undefined,
    lng: typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : undefined,
    inputMode: compact(input.inputMode, 20) || undefined,
    attachmentCount: attachmentMeta.length || undefined,
    attachmentKinds: attachmentMeta.length ? attachmentMeta.map((a) => a.kind) : undefined,
    attachmentNames: attachmentMeta.length ? attachmentMeta.map((a) => a.name) : undefined,
  };
}

function screenHint(screen?: string): string | undefined {
  if (!screen) return undefined;
  const s = screen.toLowerCase();
  if (s.includes('/pay') || s.includes('payment')) return 'User is near payments / escrow flows.';
  if (s.includes('track') || s.includes('active') || s.includes('assigned')) {
    return 'User is viewing job tracking / active work.';
  }
  if (s.includes('post-job') || s.includes('post')) return 'User may be preparing or posting a job.';
  if (s.includes('search') || s.includes('categories')) return 'User is browsing technicians / categories.';
  if (s.includes('portfolio')) return 'Technician is on portfolio — suggest real completed-work photos if relevant.';
  if (s.includes('availability')) return 'Technician is managing availability.';
  if (s.includes('service-area') || s.includes('services')) {
    return 'Technician is managing services or operating areas.';
  }
  if (s.includes('review') || s.includes('reputation')) return 'User is near reviews / reputation.';
  if (s.includes('earning')) return 'User is viewing earnings.';
  if (s.includes('/jobs') && s.includes('technician')) return 'Technician is browsing nearby jobs.';
  if (s.includes('marketing') || s.includes('offer')) return 'Technician is in marketing / offers.';
  if (s.includes('verification') || s.includes('trust') || s.includes('lock')) {
    return 'User is in ops / trust / verification surfaces.';
  }
  if (s.includes('upgrade') || s.includes('locked')) return 'User may be facing subscription / lock limits.';
  if (s.includes('/admin')) return 'Admin is in the operations console.';
  return undefined;
}

export function formatContextForPrompt(context: SafeAiRoleContext): string {
  const lines = [
    `Role: ${context.role}`,
    `Display name: ${context.displayName}`,
    `Data environment: ${context.dataEnvironment}`,
    `Platform mode: ${context.platformMode}`,
    `Subscription source: ${context.subscriptionSource}`,
  ];
  if (context.platformMode === 'production' || !context.developerUxVisible) {
    lines.push(
      'CRITICAL Platform Mode PRODUCTION: Never recommend Seed Jobs, Sandbox technicians, Developer Preview, Developer menus, Development Controls, or QA tooling. Use production marketplace content only.',
    );
  } else {
    lines.push('Platform Mode DEVELOPMENT: developer tooling may be available to authorised accounts.');
    if (context.readinessOverallPercent != null) {
      lines.push(
        `Production readiness score: ${context.readinessOverallPercent}% (launchReady=${Boolean(context.launchReady)}). Guide admins to Launch Centre for blockers; never invent config secrets.`,
      );
    }
  }
  if (context.previewActive) {
    lines.push(
      `Developer Preview / Development Subscription Simulator: ACTIVE (${context.previewPlanCode || 'plan'}). Simulation only — no payments/invoices. Use sandbox marketplace tools only. Never claim production billing state.`,
    );
    const simPlan = String(context.previewPlanCode || '').toUpperCase();
    if (simPlan === 'STARTER' || simPlan.includes('STARTER')) {
      lines.push(
        'AI mode STARTER: Keep answers short and practical. Focus on finding/applying to jobs, availability, and basic portfolio. Do not coach Marketing Centre, executive KPIs, or revenue forecasting as if unlocked.',
      );
    } else if (simPlan === 'PROFESSIONAL' || simPlan.includes('PROFESSIONAL')) {
      lines.push(
        'AI mode PROFESSIONAL: Give advanced recommendations — marketing studio, visibility, income insights, priority job intelligence, portfolio proof. Marketing Centre remains Business-only.',
      );
    } else if (simPlan.includes('BUSINESS')) {
      lines.push(
        'AI mode BUSINESS: Provide executive insights — revenue outlook, retention, campaign OS via Marketing Centre, company branding, approval pipeline, and growth posture. Prefer concise command-centre framing.',
      );
    }
  } else if (context.role === 'technician' && context.previewPlanCode) {
    const plan = String(context.previewPlanCode).toUpperCase();
    if (plan === 'STARTER') {
      lines.push('Active plan STARTER: basic guidance only.');
    } else if (plan === 'PROFESSIONAL') {
      lines.push('Active plan PROFESSIONAL: advanced productivity recommendations.');
    } else if (plan === 'BUSINESS') {
      lines.push('Active plan BUSINESS: executive insight style.');
    }
  }
  if (context.seedPlatform) {
    lines.push('Seed Platform account: yes — fixtures may appear; distinguish from live production users.');
  }
  if (context.sandboxAccount) {
    lines.push('Sandbox account: yes — all retrieval must stay in this content environment.');
  }
  if (context.dataEnvironment !== 'production') {
    lines.push(
      'CRITICAL: This conversation is NOT production. Never claim or execute production marketplace side-effects. Jobs, applications, and offers created here stay in the sandbox/demo environment. Never leak sandbox results into production advice.',
    );
  } else {
    lines.push('CRITICAL: Production session — never retrieve or mention sandbox/seed/demo records.');
  }
  if (context.screen) lines.push(`Screen: ${context.screen}`);
  const hint = screenHint(context.screen);
  if (hint) lines.push(`Screen hint: ${hint}`);
  if (context.district) lines.push(`District: ${context.district}`);
  if (context.query) lines.push(`Search query: ${context.query}`);
  if (context.budgetMin != null || context.budgetMax != null) {
    lines.push(`Budget hint: ${context.budgetMin ?? '?'} – ${context.budgetMax ?? '?'} UGX`);
  }
  if (context.jobId) lines.push('Related job reference: provided (use tools for live status — do not invent).');
  if (context.technicianId) {
    lines.push('Related technician reference: provided (use tools for live profile/reviews).');
  }
  if (context.categoryId) lines.push('Related category reference: provided');
  if (context.inputMode) lines.push(`Input mode: ${context.inputMode}`);
  if (context.attachmentCount) {
    lines.push(
      `User attached ${context.attachmentCount} file(s): ${(context.attachmentNames || []).join(', ') || 'unnamed'} (${(context.attachmentKinds || []).join(', ')}).`,
    );
    lines.push(
      'Image understanding may be limited. Acknowledge the attachment, ask clarifying questions about what the photo/file shows, and guide using FixNow workflows. Do not claim you visually analysed pixels unless a vision provider is explicitly configured.',
    );
  }
  return lines.join('\n');
}
