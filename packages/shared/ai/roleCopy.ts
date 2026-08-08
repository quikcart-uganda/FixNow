import type { AiAssistantRole } from '@fixnow/api'
import type { AiLocalPrefs } from './types'

export type RoleStarter = {
  id: string
  label: string
  prompt: string
  icon: string
}

export type RoleCopy = {
  title: string
  shortLabel: string
  statusReady: string
  statusThinking: string
  statusListening: string
  statusUnavailable: string
  greetingTitle: (firstName?: string) => string
  greetingBody: string
  placeholder: string
  placeholderMobile: string
  starters: RoleStarter[]
  quickActions: Array<{ id: string; label: string; icon: string; action: 'camera' | 'gallery' | 'voice' | 'help' }>
  disclaimer: string
  privacyNote: string
  helpNote: string
}

function firstNameOf(fullName?: string | null): string | undefined {
  const part = String(fullName || '')
    .trim()
    .split(/\s+/)[0]
  return part || undefined
}

export function getFirstName(fullName?: string | null): string | undefined {
  return firstNameOf(fullName)
}

export const ROLE_COPY: Record<AiAssistantRole, RoleCopy> = {
  customer: {
    title: 'FixNow Assistant',
    shortLabel: 'Ask FixNow',
    statusReady: 'Ready to help',
    statusThinking: 'Thinking…',
    statusListening: 'Listening…',
    statusUnavailable: 'Unavailable',
    greetingTitle: (firstName) => (firstName ? `Hi ${firstName}` : 'Hi there'),
    greetingBody:
      "I'm your FixNow Assistant. I can help you find trusted technicians, compare services, estimate costs, explain quotations and guide you through bookings.",
    placeholder: 'Ask about technicians, costs, booking…',
    placeholderMobile: 'Ask FixNow…',
    starters: [
      { id: 'c1', label: 'Book technician', prompt: 'Help me book a technician.', icon: 'person_search' },
      { id: 'c2', label: 'Track job', prompt: 'How do I track my job and technician?', icon: 'location_on' },
      { id: 'c3', label: 'Post a job', prompt: 'How do I post a job on FixNow?', icon: 'add_circle' },
      { id: 'c4', label: 'View applications', prompt: 'How do I review applications and quotations?', icon: 'assignment' },
      { id: 'c5', label: 'Payments', prompt: 'How do payments and escrow work?', icon: 'payments' },
      { id: 'c6', label: 'Support', prompt: 'I need help with my FixNow account.', icon: 'support_agent' },
    ],
    quickActions: [
      { id: 'qa-cam', label: 'Photo of issue', icon: 'photo_camera', action: 'camera' },
      { id: 'qa-gal', label: 'Upload photo', icon: 'image', action: 'gallery' },
      { id: 'qa-voice', label: 'Hold to talk', icon: 'mic', action: 'voice' },
      { id: 'qa-help', label: 'Help', icon: 'help', action: 'help' },
    ],
    disclaimer:
      "I'm here to guide you. When it's time to book, pay or confirm something, I'll take you to the right FixNow screen.",
    privacyNote:
      'Conversations stay tied to your FixNow account and role. Do not share passwords, OTP codes, or payment PINs in chat.',
    helpNote:
      'Ask about finding technicians, quotations, booking steps, escrow, reviews, and tracking. For account changes, use Profile or Help.',
  },
  technician: {
    title: 'Pro Assistant',
    shortLabel: 'Pro Assistant',
    statusReady: 'Ask me anything',
    statusThinking: 'Checking your technician profile…',
    statusListening: 'Listening…',
    statusUnavailable: 'Unavailable',
    greetingTitle: () => 'Welcome back',
    greetingBody:
      'I can help with nearby jobs, applications, profile strength, availability, pricing, earnings, and customer replies — all inside FixNow Pro.',
    placeholder: 'Ask about jobs, profile, earnings…',
    placeholderMobile: 'Ask Pro Assistant…',
    starters: [
      { id: 't1', label: 'Nearby jobs', prompt: 'How can I win more nearby jobs?', icon: 'near_me' },
      { id: 't2', label: 'My applications', prompt: 'Help me review and improve my job applications.', icon: 'assignment' },
      { id: 't3', label: 'Improve profile', prompt: 'How can I improve my FixNow Pro profile?', icon: 'badge' },
      { id: 't4', label: 'Upload portfolio', prompt: 'How should I upload portfolio photos of my work?', icon: 'photo_library' },
      { id: 't5', label: 'Set availability', prompt: 'How should I set my availability for more jobs?', icon: 'schedule' },
      { id: 't6', label: 'Pricing tips', prompt: 'Give me practical pricing tips for quotations.', icon: 'payments' },
      { id: 't7', label: 'My earnings', prompt: 'When do I get paid and how do earnings work?', icon: 'account_balance_wallet' },
      { id: 't8', label: 'Reply to customer', prompt: 'Draft a professional reply to a customer enquiry.', icon: 'chat' },
    ],
    quickActions: [
      { id: 'qa-cam', label: 'Work photo', icon: 'photo_camera', action: 'camera' },
      { id: 'qa-gal', label: 'Upload photo', icon: 'image', action: 'gallery' },
      { id: 'qa-voice', label: 'Hold to talk', icon: 'mic', action: 'voice' },
      { id: 'qa-help', label: 'Help', icon: 'help', action: 'help' },
    ],
    disclaimer:
      "I'll help with jobs, profile and earnings guidance. You always confirm actions inside FixNow Pro screens.",
    privacyNote:
      'Pro conversations are private to your technician account. Never paste customer payment details or OTP codes here.',
    helpNote:
      'Ask about nearby jobs, applications, availability, portfolio, pricing, earnings, ratings, and customer communication. Customer booking flows are outside this assistant.',
  },
  admin: {
    title: 'Ops Assistant',
    shortLabel: 'Ops Assistant',
    statusReady: 'Available now',
    statusThinking: 'Reviewing your request…',
    statusListening: 'Listening…',
    statusUnavailable: 'Unavailable',
    greetingTitle: () => 'Welcome back',
    greetingBody:
      'I can help you manage the FixNow platform, analyse activity and assist with moderation.',
    placeholder: 'Ask about moderation, analytics, marketing…',
    placeholderMobile: 'Ask Ops…',
    starters: [
      { id: 'a1', label: 'Platform health', prompt: 'Summarise platform health and recent activity.', icon: 'monitor_heart' },
      { id: 'a2', label: 'Pending verifications', prompt: 'What should I prioritise in the verification queue?', icon: 'verified_user' },
      { id: 'a3', label: 'Review reports', prompt: "Review today's moderation queue priorities.", icon: 'rate_review' },
      { id: 'a4', label: 'Marketing', prompt: 'Suggest marketing actions for this week.', icon: 'campaign' },
      { id: 'a5', label: 'Analytics', prompt: 'Give me an analytics overview of marketplace activity.', icon: 'analytics' },
      { id: 'a6', label: 'Disputes', prompt: 'How should I triage open disputes and escrow issues?', icon: 'gavel' },
      { id: 'a7', label: 'User search', prompt: 'How do I look up users, technicians, or customers safely?', icon: 'manage_search' },
      { id: 'a8', label: 'System settings', prompt: 'Where do I manage configuration and feature flags?', icon: 'settings' },
    ],
    quickActions: [
      { id: 'qa-gal', label: 'Attach image', icon: 'image', action: 'gallery' },
      { id: 'qa-voice', label: 'Hold to talk', icon: 'mic', action: 'voice' },
      { id: 'qa-help', label: 'Help', icon: 'help', action: 'help' },
    ],
    disclaimer:
      'I can explain and suggest. Any moderation, payout or config change is always confirmed in FixNow admin tools.',
    privacyNote:
      'Ops chats are admin-scoped. Avoid pasting raw PII dumps; use FixNow admin tools for sensitive account actions.',
    helpNote:
      'Ask for platform health, verifications, moderation, marketing, analytics, disputes, and settings guidance — not customer booking or technician job coaching.',
  },
}

export function roleCopy(role: AiAssistantRole): RoleCopy {
  return ROLE_COPY[role]
}

const PREFS_KEY = 'fixnow.ai.prefs.v1'

export const DEFAULT_AI_PREFS: AiLocalPrefs = {
  showMic: true,
  showCamera: true,
  compactComposer: false,
}

export function loadAiPrefs(): AiLocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_AI_PREFS }
    const parsed = JSON.parse(raw) as Partial<AiLocalPrefs>
    return { ...DEFAULT_AI_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_AI_PREFS }
  }
}

export function saveAiPrefs(prefs: AiLocalPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota */
  }
}

function pinKey(role: AiAssistantRole, userId: string) {
  return `fixnow.ai.pins.${role}.${userId}`
}

export function loadPinnedIds(role: AiAssistantRole, userId: string): string[] {
  try {
    const raw = localStorage.getItem(pinKey(role, userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function savePinnedIds(role: AiAssistantRole, userId: string, ids: string[]) {
  try {
    localStorage.setItem(pinKey(role, userId), JSON.stringify(ids.slice(0, 40)))
  } catch {
    /* ignore */
  }
}

export function newAiId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatAiTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatAiDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
