export type UnknownRecord = Record<string, unknown>

/** Runtime-safe array coercion for untrusted API/cache values. */
export function safeArray<T>(value: readonly T[] | null | undefined): T[]
export function safeArray<T = unknown>(value: unknown): T[]
export function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** Runtime-safe plain-object coercion. Arrays and null are rejected. */
export function safeObject(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

export function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function safeNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function safeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Handles common list envelopes while preserving strict empty fallback. */
export function safeItems<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  const object = safeObject(value)
  return safeArray<T>(object.items)
}
