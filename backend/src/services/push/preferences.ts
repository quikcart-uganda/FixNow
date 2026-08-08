import { NotificationPreference } from '../../models/index.js';
import type { PushCategory } from './events.js';

/** Preference keys stored in NotificationPreference.categories Map (schema unchanged). */
export const PREF_KEYS = {
  SOUND: 'sound',
  BADGE: 'badge',
} as const;

export type EffectivePrefs = {
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  sound: boolean;
  badge: boolean;
  categoryEnabled: boolean;
  quietHoursActive: boolean;
  quietHours?: { start?: string; end?: string; timezone?: string };
};

function parseHm(value?: string): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h! < 0 || h! > 23 || m! < 0 || m! > 59) return null;
  return h! * 60 + m!;
}

/** Returns true when "now" falls inside quiet hours window (supports overnight ranges). */
export function isWithinQuietHours(
  quiet?: { start?: string; end?: string; timezone?: string },
  now = new Date(),
): boolean {
  const start = parseHm(quiet?.start);
  const end = parseHm(quiet?.end);
  if (start === null || end === null) return false;

  const tz = quiet?.timezone || 'Africa/Kampala';
  let minutes: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    minutes = hour * 60 + minute;
  } catch {
    minutes = now.getHours() * 60 + now.getMinutes();
  }

  if (start === end) return true;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function mapToRecord(categories: unknown): Record<string, boolean> {
  if (!categories) return {};
  if (categories instanceof Map) {
    return Object.fromEntries([...categories.entries()].map(([k, v]) => [String(k), Boolean(v)]));
  }
  if (typeof categories === 'object') {
    return Object.fromEntries(
      Object.entries(categories as Record<string, unknown>).map(([k, v]) => [k, Boolean(v)]),
    );
  }
  return {};
}

export async function ensurePreferences(userId: string) {
  let prefs = await NotificationPreference.findOne({ userId });
  if (!prefs) {
    prefs = await NotificationPreference.create({
      userId,
      channels: { inApp: true, push: true, sms: false, email: true, whatsapp: false },
      categories: {
        auth: true,
        marketplace: true,
        messaging: true,
        admin: true,
        sound: true,
        badge: true,
      },
      quietHours: { timezone: 'Africa/Kampala' },
    });
  }
  return prefs;
}

export async function getEffectivePrefs(userId: string, category: PushCategory): Promise<EffectivePrefs> {
  const prefs = await ensurePreferences(userId);
  const categories = mapToRecord(prefs.categories);
  const categoryEnabled = categories[category] !== false;
  const sound = categories[PREF_KEYS.SOUND] !== false;
  const badge = categories[PREF_KEYS.BADGE] !== false;
  const quietHoursActive = isWithinQuietHours(prefs.quietHours ?? undefined);

  return {
    pushEnabled: prefs.channels?.push !== false,
    inAppEnabled: prefs.channels?.inApp !== false,
    emailEnabled: prefs.channels?.email !== false,
    smsEnabled: prefs.channels?.sms === true,
    sound,
    badge,
    categoryEnabled,
    quietHoursActive,
    quietHours: prefs.quietHours
      ? {
          start: prefs.quietHours.start,
          end: prefs.quietHours.end,
          timezone: prefs.quietHours.timezone,
        }
      : undefined,
  };
}

export async function updatePreferences(
  userId: string,
  input: {
    channels?: Partial<{
      inApp: boolean;
      push: boolean;
      sms: boolean;
      email: boolean;
      whatsapp: boolean;
    }>;
    categories?: Record<string, boolean>;
    quietHours?: { start?: string | null; end?: string | null; timezone?: string };
    sound?: boolean;
    badge?: boolean;
  },
) {
  const prefs = await ensurePreferences(userId);
  if (input.channels) {
    prefs.channels = {
      inApp: input.channels.inApp ?? prefs.channels.inApp,
      push: input.channels.push ?? prefs.channels.push,
      sms: input.channels.sms ?? prefs.channels.sms,
      email: input.channels.email ?? prefs.channels.email,
      whatsapp: input.channels.whatsapp ?? prefs.channels.whatsapp,
    };
  }

  const current = mapToRecord(prefs.categories);
  if (input.categories) Object.assign(current, input.categories);
  if (typeof input.sound === 'boolean') current[PREF_KEYS.SOUND] = input.sound;
  if (typeof input.badge === 'boolean') current[PREF_KEYS.BADGE] = input.badge;
  prefs.categories = current as unknown as typeof prefs.categories;
  prefs.markModified('categories');

  if (input.quietHours) {
    prefs.quietHours = {
      start: input.quietHours.start === null ? undefined : (input.quietHours.start ?? prefs.quietHours?.start),
      end: input.quietHours.end === null ? undefined : (input.quietHours.end ?? prefs.quietHours?.end),
      timezone: input.quietHours.timezone ?? prefs.quietHours?.timezone ?? 'Africa/Kampala',
    };
  }

  await prefs.save();
  return prefs;
}

export function serializePreferences(prefs: InstanceType<typeof NotificationPreference>) {
  const categories = mapToRecord(prefs.categories);
  return {
    userId: prefs.userId.toString(),
    channels: prefs.channels,
    categories,
    sound: categories[PREF_KEYS.SOUND] !== false,
    badge: categories[PREF_KEYS.BADGE] !== false,
    quietHours: prefs.quietHours ?? { timezone: 'Africa/Kampala' },
  };
}
