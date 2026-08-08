import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  getSocketStatus,
  joinJobRoom,
  leaveJobRoom,
  onSocketEvent,
  SOCKET_EVENTS,
  subscribeSocketStatus,
  updateSocketAuth,
  type SocketConnectionStatus,
  type SocketEventName,
} from '@fixnow/api'
import { tokenStorage } from '@fixnow/api'
import { useAuth } from './AuthProvider'

type SocketContextValue = {
  status: SocketConnectionStatus
  isConnected: boolean
  joinJob: (jobId: string) => void
  leaveJob: (jobId: string) => void
  subscribe: <T = unknown>(event: SocketEventName | string, handler: (payload: T) => void) => () => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, status: authStatus } = useAuth()
  const [status, setStatus] = useState<SocketConnectionStatus>(() => getSocketStatus())

  useEffect(() => subscribeSocketStatus(setStatus), [])

  useEffect(() => {
    if (authStatus === 'loading') return
    if (isAuthenticated) {
      connectSocket(tokenStorage.getAccessToken())
    } else {
      disconnectSocket()
    }
    return () => {
      // Keep socket across route changes; disconnect only on logout / unmount of provider root.
    }
  }, [isAuthenticated, authStatus])

  useEffect(() => {
    return () => disconnectSocket()
  }, [])

  // Refresh socket auth when access token rotates — listen for storage/session events
  // instead of polling every minute (saves wakeups on mobile).
  useEffect(() => {
    if (!isAuthenticated) return
    const sync = () => {
      const token = tokenStorage.getAccessToken()
      if (token && getSocket()) updateSocketAuth(token)
    }
    window.addEventListener('fixnow:socket-connected', sync)
    window.addEventListener('fixnow:app-resume', sync)
    // Fallback low-frequency sync for silent token refresh without events.
    const id = window.setInterval(sync, 5 * 60_000)
    return () => {
      window.removeEventListener('fixnow:socket-connected', sync)
      window.removeEventListener('fixnow:app-resume', sync)
      window.clearInterval(id)
    }
  }, [isAuthenticated])

  const joinJob = useCallback((jobId: string) => {
    if (jobId) joinJobRoom(jobId)
  }, [])

  const leaveJob = useCallback((jobId: string) => {
    if (jobId) leaveJobRoom(jobId)
  }, [])

  const subscribe = useCallback(
    <T,>(event: SocketEventName | string, handler: (payload: T) => void) => {
      return onSocketEvent(event, handler)
    },
    [],
  )

  const value = useMemo(
    () => ({
      status,
      isConnected: status === 'connected',
      joinJob,
      leaveJob,
      subscribe,
    }),
    [status, joinJob, leaveJob, subscribe],
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}

/** Subscribe to one or more events; handler is stable via ref to avoid duplicate listeners. */
export function useSocketEvent<T = unknown>(
  event: SocketEventName | SocketEventName[] | string | string[],
  handler: (payload: T, eventName: string) => void,
  enabled = true,
) {
  const { subscribe, status } = useSocket()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  // Re-bind only when the socket is usable again after a full disconnect.
  // Avoid tearing down listeners on every 'connecting'/'error' flap.
  const socketReady = status === 'connected' || status === 'connecting' || status === 'error'

  useEffect(() => {
    if (!enabled || !socketReady) return
    const events = Array.isArray(event) ? event : [event]
    const unsubs = events.map((name) =>
      subscribe<T>(name, (payload) => handlerRef.current(payload, name)),
    )
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event identity via JSON
  }, [subscribe, socketReady, enabled, JSON.stringify(event)])
}

/**
 * Debounced refresh helper — merges bursty realtime events into a single reload.
 */
export function useRealtimeReload(
  reload: () => void | Promise<unknown>,
  events: Array<SocketEventName | string>,
  options?: { enabled?: boolean; delayMs?: number; joinJobId?: string },
) {
  const { joinJob, leaveJob } = useSocket()
  const timer = useRef<number | null>(null)
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const delay = options?.delayMs ?? 250
  const enabled = options?.enabled !== false

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void reloadRef.current()
    }, delay)
  }, [delay])

  useSocketEvent(events, () => schedule(), enabled)

  useEffect(() => {
    const jobId = options?.joinJobId
    if (!jobId || !enabled) return
    joinJob(jobId)
    return () => leaveJob(jobId)
  }, [options?.joinJobId, enabled, joinJob, leaveJob])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])
}

export { SOCKET_EVENTS }
