import { io, type Socket } from 'socket.io-client'
import { recordSocketDiagnostic, registerSocketDiagnostics } from './diagnostics'
import { tokenStorage } from './tokenStorage'
import { getSocketUrl, SOCKET_EVENTS, type SocketEventName } from './socketEvents'
import { clearSocketDedupe, dedupeSocketPayload } from './eventDedupe'

export type SocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'offline'

type StatusListener = (status: SocketConnectionStatus) => void

let socket: Socket | null = null
let status: SocketConnectionStatus = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'disconnected'
const statusListeners = new Set<StatusListener>()
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let visibilityBound = false
let authFailureStreak = 0

registerSocketDiagnostics(() => ({
  status,
  connected: Boolean(socket?.connected),
  id: socket?.id,
}))

function setStatus(next: SocketConnectionStatus) {
  if (status === next) return
  status = next
  statusListeners.forEach((fn) => fn(next))
}

export function getSocketStatus(): SocketConnectionStatus {
  return status
}

export function subscribeSocketStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  listener(status)
  return () => statusListeners.delete(listener)
}

export function getSocket(): Socket | null {
  return socket
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startHeartbeat(s: Socket) {
  clearHeartbeat()
  heartbeatTimer = setInterval(() => {
    // Skip heartbeats while backgrounded — WebView timers still fire and drain battery.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (s.connected) {
      s.emit(SOCKET_EVENTS.HEARTBEAT, Date.now())
    }
  }, 25_000)
}

function refreshSocketAuthFromStorage() {
  const token = tokenStorage.getAccessToken()
  if (!socket) return token
  if (token) socket.auth = { token }
  return token
}

function bindBrowserNetwork() {
  if (visibilityBound || typeof window === 'undefined') return
  visibilityBound = true

  window.addEventListener('offline', () => {
    setStatus('offline')
  })
  window.addEventListener('online', () => {
    const token = tokenStorage.getAccessToken()
    if (token) {
      setStatus('connecting')
      connectSocket(token)
    } else {
      setStatus('disconnected')
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tokenStorage.getAccessToken()) {
      const s = getSocket()
      if (!s?.connected) connectSocket()
      else {
        refreshSocketAuthFromStorage()
        s.emit(SOCKET_EVENTS.HEARTBEAT, Date.now())
      }
    }
  })
  window.addEventListener('fixnow:app-resume', () => {
    if (!tokenStorage.getAccessToken()) return
    const s = getSocket()
    if (!s?.connected) connectSocket()
    else {
      refreshSocketAuthFromStorage()
      s.emit(SOCKET_EVENTS.HEARTBEAT, Date.now())
    }
  })
}

export function connectSocket(accessToken?: string | null): Socket | null {
  bindBrowserNetwork()

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline')
    return null
  }

  const token = accessToken ?? tokenStorage.getAccessToken()
  if (!token) {
    disconnectSocket()
    return null
  }

  if (socket?.connected) {
    socket.auth = { token }
    return socket
  }

  if (socket) {
    socket.auth = { token }
    setStatus('connecting')
    socket.connect()
    return socket
  }

  setStatus('connecting')
  socket = io(getSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 25,
    reconnectionDelay: 800,
    reconnectionDelayMax: 12_000,
    timeout: 15_000,
    auth: { token },
  })

  socket.on('connect', () => {
    authFailureStreak = 0
    setStatus('connected')
    recordSocketDiagnostic('connect', 'socket connected')
    if (socket) startHeartbeat(socket)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fixnow:socket-connected'))
    }
  })
  socket.on('disconnect', () => {
    clearHeartbeat()
    recordSocketDiagnostic('disconnect', 'socket disconnected')
    if (typeof navigator !== 'undefined' && !navigator.onLine) setStatus('offline')
    else setStatus('disconnected')
  })
  socket.on('connect_error', (err: Error) => {
    recordSocketDiagnostic('error', err?.message || 'connect_error')
    const message = String(err?.message ?? '').toLowerCase()
    const authRejected =
      message.includes('unauthorized') ||
      message.includes('jwt') ||
      message.includes('session') ||
      message.includes('invalidated') ||
      message.includes('token')
    if (authRejected) {
      authFailureStreak += 1
      // Re-read storage in case HTTP refresh already rotated the token.
      const next = refreshSocketAuthFromStorage()
      if (!next || authFailureStreak >= 3) {
        setStatus('error')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fixnow:socket-auth-failed'))
        }
        return
      }
    }
    setStatus('error')
  })
  socket.on('reconnect_attempt', () => {
    // Always refresh auth before each reconnect so rotated access tokens are used.
    refreshSocketAuthFromStorage()
    setStatus('connecting')
  })
  socket.on('reconnect', () => {
    authFailureStreak = 0
    setStatus('connected')
    if (socket) startHeartbeat(socket)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fixnow:socket-connected'))
    }
  })
  socket.on(SOCKET_EVENTS.CONNECTION_READY, () => setStatus('connected'))
  socket.on(SOCKET_EVENTS.HEARTBEAT_ACK, () => {
    /* latency probe — status stays connected */
  })

  return socket
}

export function disconnectSocket(): void {
  clearHeartbeat()
  authFailureStreak = 0
  clearSocketDedupe()
  if (!socket) {
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'disconnected')
    return
  }
  socket.off('connect')
  socket.off('disconnect')
  socket.off('connect_error')
  socket.off('reconnect_attempt')
  socket.off('reconnect')
  socket.off(SOCKET_EVENTS.CONNECTION_READY)
  socket.off(SOCKET_EVENTS.HEARTBEAT_ACK)
  socket.disconnect()
  socket = null
  setStatus('disconnected')
}

/** Apply a rotated access token to the live socket without forcing a full reconnect. */
export function updateSocketAuth(token: string): void {
  if (!socket) return
  socket.auth = { token }
}

export function forceReconnectSocket(): Socket | null {
  const token = tokenStorage.getAccessToken()
  if (!token) {
    disconnectSocket()
    return null
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline')
    return null
  }
  authFailureStreak = 0
  if (socket) {
    socket.auth = { token }
    setStatus('connecting')
    if (socket.disconnected) socket.connect()
    else {
      socket.disconnect()
      socket.connect()
    }
    return socket
  }
  return connectSocket(token)
}

export function joinJobRoom(jobId: string): void {
  socket?.emit('job:join', jobId)
}

export function leaveJobRoom(jobId: string): void {
  socket?.emit('job:leave', jobId)
}

export function joinConversationRoom(conversationId: string): void {
  socket?.emit('conversation:join', conversationId)
}

export function leaveConversationRoom(conversationId: string): void {
  socket?.emit('conversation:leave', conversationId)
}

export function emitTypingStart(conversationId: string): void {
  socket?.emit('typing:start', { conversationId })
}

export function emitTypingStop(conversationId: string): void {
  socket?.emit('typing:stop', { conversationId })
}

export function onSocketEvent<T = unknown>(
  event: SocketEventName | string,
  handler: (payload: T) => void,
): () => void {
  const s = socket ?? connectSocket()
  if (!s) return () => undefined
  const wrapped = ((payload: T) => {
    if (!dedupeSocketPayload(String(event), payload)) return
    handler(payload)
  }) as (...args: unknown[]) => void
  s.on(event, wrapped)
  return () => {
    s.off(event, wrapped)
  }
}

export { SOCKET_EVENTS, getSocketUrl, dedupeSocketPayload }
