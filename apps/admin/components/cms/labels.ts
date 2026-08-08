/** Human-readable labels for CMS — never show raw enums to administrators. */

export const WORKSPACES = [
  {
    id: 'knowledge',
    label: 'Knowledge Base',
    description: 'Help articles, FAQs, guides and tutorials shown across FixNow.',
    categories: ['support', 'public'] as const,
  },
  {
    id: 'legal',
    label: 'Legal',
    description: 'Privacy, cookies, terms, escrow and account policies.',
    categories: ['legal', 'account'] as const,
  },
  {
    id: 'customer',
    label: 'Customer Experience',
    description: 'Home banners, help cards, empty states and customer-facing copy.',
    categories: ['public', 'support', 'authentication'] as const,
    audience: 'customer' as const,
  },
  {
    id: 'technician',
    label: 'Technician Experience',
    description: 'Onboarding, tips, safety content and marketplace announcements.',
    categories: ['support', 'public', 'authentication'] as const,
    audience: 'technician' as const,
  },
  {
    id: 'marketing',
    label: 'Marketing Content',
    description: 'Promotions, sponsored campaigns, advertisements and dynamic homepage sections.',
    categories: [] as const,
  },
  {
    id: 'media',
    label: 'Media Library',
    description: 'Upload and reuse images, banners and icons across the platform.',
    categories: [] as const,
  },
] as const

export type WorkspaceId = (typeof WORKSPACES)[number]['id']

export function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    legal: 'Legal',
    support: 'Help & support',
    public: 'Public pages',
    authentication: 'Sign-in experience',
    account: 'Account policies',
    system: 'System notices',
  }
  return map[category] || category
}

export function audienceLabel(audience: string): string {
  const map: Record<string, string> = {
    all: 'Everyone',
    customer: 'Customers',
    technician: 'Technicians',
    admin: 'Administrators',
  }
  return map[audience] || audience
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    scheduled: 'Scheduled',
    archived: 'Archived',
  }
  return map[status] || status
}

export function formatEdited(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
