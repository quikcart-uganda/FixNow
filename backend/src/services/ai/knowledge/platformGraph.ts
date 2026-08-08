/**
 * FixNow Platform Knowledge Graph (graph-lite).
 * AI retrieves screens, workflows, and deep links from here — live state still comes from tools/APIs.
 * Never invents hidden modules for roles that lack permission.
 */

import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';

export type GraphNodeKind =
  | 'screen'
  | 'workflow'
  | 'api'
  | 'permission'
  | 'plan'
  | 'state'
  | 'module';

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  roles: AiAssistantRole[];
  /** Admin capability required (Finance/Support/Super). Empty = any admin. */
  adminCapabilities?: string[];
  href?: string;
  description: string;
  related?: string[];
};

const NODES: GraphNode[] = [
  // Customer
  { id: 'screen.customer.home', kind: 'screen', label: 'Customer Home', roles: ['customer'], href: '/customer/home', description: 'Customer dashboard and discovery' },
  { id: 'screen.customer.search', kind: 'screen', label: 'Search technicians', roles: ['customer'], href: '/customer/search', description: 'Find technicians by category and location' },
  { id: 'screen.customer.postJob', kind: 'screen', label: 'Post a job', roles: ['customer'], href: '/customer/post-job', description: 'Create and publish a service job' },
  { id: 'screen.customer.jobs', kind: 'screen', label: 'My Jobs', roles: ['customer'], href: '/customer/jobs', description: 'Track, cancel, and manage jobs' },
  { id: 'screen.customer.messages', kind: 'screen', label: 'Messages', roles: ['customer'], href: '/customer/messages', description: 'Job-scoped chat' },
  { id: 'screen.customer.settings', kind: 'screen', label: 'Settings', roles: ['customer'], href: '/customer/settings', description: 'Profile and preferences' },
  { id: 'workflow.customer.createJob', kind: 'workflow', label: 'Create job', roles: ['customer'], description: 'Collect category, location, schedule, budget → preview → confirm → jobService.create', related: ['screen.customer.postJob', 'api.jobs.create'] },
  { id: 'workflow.customer.cancelJob', kind: 'workflow', label: 'Cancel job', roles: ['customer'], description: 'Locate job → explain consequences → confirm → jobService.cancel', related: ['screen.customer.jobs', 'api.jobs.cancel'] },
  { id: 'api.jobs.create', kind: 'api', label: 'Create job API', roles: ['customer'], description: 'Existing marketplace job create (draft/publish)' },
  { id: 'api.jobs.cancel', kind: 'api', label: 'Cancel job API', roles: ['customer'], description: 'Existing customer job cancel' },

  // Technician
  { id: 'screen.technician.dashboard', kind: 'screen', label: 'Technician Dashboard', roles: ['technician'], href: '/technician/dashboard', description: 'Work summary and free-job meter' },
  { id: 'screen.technician.jobs', kind: 'screen', label: 'Nearby Jobs', roles: ['technician'], href: '/technician/jobs', description: 'Browse and apply' },
  { id: 'screen.technician.upgrade', kind: 'screen', label: 'Upgrade Plan', roles: ['technician'], href: '/technician/upgrade', description: 'Subscription plans comparison and checkout' },
  { id: 'screen.technician.subscription', kind: 'screen', label: 'Subscription Centre', roles: ['technician'], href: '/technician/subscription', description: 'Entitlements, badge, renewals' },
  { id: 'screen.technician.marketing', kind: 'screen', label: 'Marketing', roles: ['technician'], href: '/technician/marketing', description: 'Offers and creatives (plan-gated)' },
  { id: 'screen.technician.boosts', kind: 'screen', label: 'Profile Boosts', roles: ['technician'], href: '/technician/boosts', description: 'Optional visibility products' },
  { id: 'screen.technician.portfolio', kind: 'screen', label: 'Portfolio', roles: ['technician'], href: '/technician/portfolio', description: 'Photos and projects' },
  { id: 'screen.technician.availability', kind: 'screen', label: 'Availability', roles: ['technician'], href: '/technician/availability', description: 'Working status and hours' },
  { id: 'workflow.technician.upgrade', kind: 'workflow', label: 'Upgrade subscription', roles: ['technician'], description: 'Navigate to plans → MoMo payment → admin approval. AI never activates paid plans.', related: ['screen.technician.upgrade'] },
  { id: 'workflow.technician.availability', kind: 'workflow', label: 'Update availability', roles: ['technician'], description: 'Confirm → technicianService.updateAvailability', related: ['screen.technician.availability'] },
  { id: 'workflow.technician.offer', kind: 'workflow', label: 'Create offer draft', roles: ['technician'], description: 'Guide to marketing create; approval required before publish', related: ['screen.technician.marketing'] },
  { id: 'plan.free', kind: 'plan', label: 'Free', roles: ['technician', 'admin'], description: 'Free completed-job quota; upgrade optional anytime' },
  { id: 'plan.starter', kind: 'plan', label: 'Starter', roles: ['technician', 'admin'], description: 'Unlimited applications after free quota' },
  { id: 'plan.professional', kind: 'plan', label: 'Professional', roles: ['technician', 'admin'], description: 'Advertising, offers, premium branding' },
  { id: 'plan.business', kind: 'plan', label: 'Business', roles: ['technician', 'admin'], description: 'Company portal and Marketing Centre' },

  // Admin — capability gated
  { id: 'screen.admin.dashboard', kind: 'screen', label: 'Admin Dashboard', roles: ['admin'], href: '/admin/dashboard', description: 'Command Center overview', adminCapabilities: ['CanViewReports'] },
  { id: 'screen.admin.payments', kind: 'screen', label: 'Payments & Escrow', roles: ['admin'], href: '/admin/payments', description: 'Finance modules', adminCapabilities: ['CanManageFinance'] },
  { id: 'screen.admin.subscriptions', kind: 'screen', label: 'Subscriptions', roles: ['admin'], href: '/admin/subscriptions', description: 'Plan catalogue and payment verification', adminCapabilities: ['CanManageSubscriptions'] },
  { id: 'screen.admin.technicians', kind: 'screen', label: 'Technicians', roles: ['admin'], href: '/admin/technicians', description: 'Technician support and moderation', adminCapabilities: ['CanManageUsers'] },
  { id: 'screen.admin.customers', kind: 'screen', label: 'Customers', roles: ['admin'], href: '/admin/customers', description: 'Customer support', adminCapabilities: ['CanManageUsers'] },
  { id: 'screen.admin.verification', kind: 'screen', label: 'Verification', roles: ['admin'], href: '/admin/verification', description: 'Identity verification queue', adminCapabilities: ['CanManageSupport'] },
  { id: 'screen.admin.content', kind: 'screen', label: 'CMS Content', roles: ['admin'], href: '/admin/content', description: 'Content blocks', adminCapabilities: ['CanManageContent'] },
  { id: 'screen.admin.marketing', kind: 'screen', label: 'Marketing', roles: ['admin'], href: '/admin/marketing', description: 'Offers and promotions', adminCapabilities: ['CanManageMarketing'] },
  { id: 'screen.admin.admins', kind: 'screen', label: 'Administrators', roles: ['admin'], href: '/admin/admins', description: 'Role management — Super Admin only', adminCapabilities: ['CanManageAdmins'] },
  { id: 'screen.admin.devAccess', kind: 'screen', label: 'Development Access', roles: ['admin'], href: '/admin/settings/development-access', description: 'Dev Admin lifecycle — Super Admin only', adminCapabilities: ['CanManageDevelopmentAccess'] },
  { id: 'screen.admin.providers', kind: 'screen', label: 'Provider Manager', roles: ['admin'], href: '/admin/settings/providers', description: 'Infrastructure providers — Super Admin only', adminCapabilities: ['CanManageProviders'] },
  { id: 'screen.admin.audit', kind: 'screen', label: 'Audit Logs', roles: ['admin'], href: '/admin/audit', description: 'Security audit trail', adminCapabilities: ['CanViewAudit'] },
];

export function listNodesForRole(
  role: AiAssistantRole,
  adminCapabilities?: Record<string, boolean> | null,
): GraphNode[] {
  return NODES.filter((n) => {
    if (!n.roles.includes(role)) return false;
    if (role !== 'admin' || !n.adminCapabilities?.length) return true;
    if (!adminCapabilities) return false;
    // Super Admin wildcard capabilities already true in resolver
    return n.adminCapabilities.some((c) => adminCapabilities[c] === true);
  });
}

export function findNavigation(
  role: AiAssistantRole,
  query: string,
  adminCapabilities?: Record<string, boolean> | null,
): GraphNode | null {
  const q = query.toLowerCase();
  const candidates = listNodesForRole(role, adminCapabilities).filter((n) => n.kind === 'screen' && n.href);
  const scored = candidates
    .map((n) => {
      const hay = `${n.label} ${n.description} ${n.id} ${n.href}`.toLowerCase();
      let score = 0;
      for (const token of q.split(/\s+/).filter(Boolean)) {
        if (hay.includes(token)) score += 1;
      }
      // keyword boosts
      if (/subscription|upgrade|plan|starter|professional|business/.test(q) && /upgrade|subscription/.test(hay))
        score += 3;
      if (/advert|offer|marketing|campaign/.test(q) && /marketing|offer/.test(hay)) score += 3;
      if (/portfolio|photo|project/.test(q) && /portfolio/.test(hay)) score += 3;
      if (/payment|escrow|revenue|refund|finance/.test(q) && /payment|escrow|subscription/.test(hay)) score += 3;
      if (/availab|offline|busy|calendar/.test(q) && /availab/.test(hay)) score += 3;
      if (/job|book|post|cancel/.test(q) && /job|post/.test(hay)) score += 2;
      if (/admin|role|invite/.test(q) && /admin/.test(hay)) score += 2;
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.n || null;
}

export function describeWorkflowsForPrompt(
  role: AiAssistantRole,
  adminCapabilities?: Record<string, boolean> | null,
): string {
  const workflows = listNodesForRole(role, adminCapabilities).filter((n) => n.kind === 'workflow' || n.kind === 'plan');
  if (!workflows.length) return '';
  return workflows.map((w) => `- ${w.label}: ${w.description}`).join('\n');
}

export function platformGraphSummary(
  role: AiAssistantRole,
  adminCapabilities?: Record<string, boolean> | null,
): {
  screens: Array<{ label: string; href?: string; description: string }>;
  workflows: Array<{ label: string; description: string }>;
  plans: Array<{ label: string; description: string }>;
} {
  const nodes = listNodesForRole(role, adminCapabilities);
  return {
    screens: nodes
      .filter((n) => n.kind === 'screen')
      .map((n) => ({ label: n.label, href: n.href, description: n.description })),
    workflows: nodes
      .filter((n) => n.kind === 'workflow')
      .map((n) => ({ label: n.label, description: n.description })),
    plans: nodes
      .filter((n) => n.kind === 'plan')
      .map((n) => ({ label: n.label, description: n.description })),
  };
}
