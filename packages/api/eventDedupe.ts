const seen = new Map<string, number>()
const MAX_SEEN = 400
const TTL_MS = 10 * 60_000

function fingerprint(event: string, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return `${event}:${String(payload)}`
  const obj = payload as Record<string, unknown>
  const id =
    obj.id ??
    obj._id ??
    obj.messageId ??
    obj.notificationId ??
    obj.jobId ??
    obj.transactionId ??
    obj.reference ??
    null
  const updatedAt = obj.updatedAt ?? obj.createdAt ?? obj.ts ?? obj.timestamp ?? null
  if (id == null && updatedAt == null) return null
  return `${event}:${String(id)}:${String(updatedAt)}`
}

/** Returns true when this is the first time we've seen the payload recently. */
export function dedupeSocketPayload(event: string, payload: unknown): boolean {
  const key = fingerprint(event, payload)
  if (!key) return true
  const now = Date.now()
  if (seen.size > MAX_SEEN) {
    // Drop oldest half when the map grows — O(n) but rare; prevents unbounded growth.
    const entries = [...seen.entries()].sort((a, b) => a[1] - b[1])
    const drop = Math.ceil(entries.length / 2)
    for (let i = 0; i < drop; i++) seen.delete(entries[i]![0])
  }
  const prev = seen.get(key)
  if (prev && now - prev < TTL_MS) return false
  seen.set(key, now)
  return true
}

export function clearSocketDedupe(): void {
  seen.clear()
}

export function orderByCreatedAt<T extends Record<string, unknown>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const at = Date.parse(String(a.createdAt ?? a.updatedAt ?? 0)) || 0
    const bt = Date.parse(String(b.createdAt ?? b.updatedAt ?? 0)) || 0
    if (at !== bt) return at - bt
    return String(a._id ?? a.id ?? '').localeCompare(String(b._id ?? b.id ?? ''))
  })
}
