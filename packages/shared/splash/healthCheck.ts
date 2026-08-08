import { getSocketUrl } from '@fixnow/api'

export type BackendHealthState = 'checking' | 'ok' | 'degraded' | 'offline' | 'error'

export type BackendHealthResult = {
  state: BackendHealthState
  online: boolean
  statusCode?: number
  mongodb?: string
  message: string
  checkedAt: number
}

function isBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function getBackendOrigin() {
  try {
    return String(getSocketUrl() || '').replace(/\/+$/, '') || 'http://localhost:4000'
  } catch {
    return 'http://localhost:4000'
  }
}

export async function checkBackendHealth(timeoutMs = 2500): Promise<BackendHealthResult> {
  const checkedAt = Date.now()
  if (!isBrowserOnline()) {
    return {
      state: 'offline',
      online: false,
      message: 'You are offline. Continuing in offline mode.',
      checkedAt,
    }
  }

  const origin = getBackendOrigin()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${origin}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const payload = (await response.json().catch(() => null)) as
      | {
          data?: {
            status?: string
            mongodb?: string
            circuits?: { open?: string[] }
          }
          status?: string
          mongodb?: string
        }
      | null

    const data = payload?.data ?? payload
    const circuits = data && 'circuits' in data ? data.circuits : undefined
    const serviceStatus = String(data?.status || '').toLowerCase()
    const mongodb = data?.mongodb ? String(data.mongodb) : undefined
    const openCircuits = Array.isArray(circuits?.open) ? circuits.open : []

    if (!response.ok || serviceStatus === 'degraded') {
      const circuitHint = openCircuits.length ? ` Open circuits: ${openCircuits.join(', ')}.` : ''
      return {
        state: 'degraded',
        online: true,
        statusCode: response.status,
        mongodb,
        message: `Backend is reachable but degraded.${circuitHint} Continuing…`,
        checkedAt,
      }
    }

    return {
      state: 'ok',
      online: true,
      statusCode: response.status,
      mongodb,
      message: 'Connected to FixNow services',
      checkedAt,
    }
  } catch {
    const online = isBrowserOnline()
    return {
      state: online ? 'error' : 'offline',
      online,
      message: online
        ? 'Could not reach FixNow services. Continuing…'
        : 'You are offline. Continuing in offline mode.',
      checkedAt,
    }
  } finally {
    window.clearTimeout(timer)
  }
}
