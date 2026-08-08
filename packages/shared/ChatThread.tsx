import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  emitTypingStart,
  emitTypingStop,
  getFriendlyErrorMessage,
  joinConversationRoom,
  leaveConversationRoom,
  messagesApi,
  newClientMessageId,
  SOCKET_EVENTS,
} from '@fixnow/api'
import { useAuth, useSocketEvent } from '@fixnow/hooks'
import { BottomSheet, LazyImage } from '@fixnow/ui'
import { AsyncStateView } from './AsyncStateView'
import { safeArray } from '@fixnow/utils'
import { useOptionalLocationPermission } from './location'
import { useOptionalAppDownloadReminder } from './appDownload'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type MsgRow = {
  id: string
  body: string
  type: string
  senderId: string
  createdAt: string
  editedAt?: string | null
  deliveredAt?: string | null
  attachmentUrl?: string
  meta?: Record<string, unknown>
}

function mapMessage(raw: Record<string, unknown>, attachments?: unknown[]): MsgRow {
  const att = Array.isArray(attachments) && attachments[0] ? (attachments[0] as Record<string, unknown>) : null
  const meta = (raw.meta as Record<string, unknown>) || {}
  return {
    id: String(raw._id ?? raw.id),
    body: String(raw.body ?? ''),
    type: String(raw.type ?? 'text'),
    senderId: String(raw.senderId ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    editedAt: raw.editedAt ? String(raw.editedAt) : null,
    deliveredAt: raw.deliveredAt ? String(raw.deliveredAt) : null,
    attachmentUrl: att ? String(att.url) : typeof meta.attachmentUrl === 'string' ? meta.attachmentUrl : undefined,
    meta,
  }
}

export function ChatThread({
  conversationId,
  readOnly = false,
  backHref,
  title = 'Conversation',
}: {
  conversationId: string
  readOnly?: boolean
  backHref?: string
  title?: string
}) {
  const { user } = useAuth()
  const locationPermission = useOptionalLocationPermission()
  const appDownload = useOptionalAppDownloadReminder()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'empty'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [canSend, setCanSend] = useState(false)
  const [locked, setLocked] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [editWindowMs, setEditWindowMs] = useState(15 * 60 * 1000)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | null>(null)
  const pendingClientMessageId = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    if (!conversationId) return
    setStatus('loading')
    setError(null)
    try {
      const res = await messagesApi.getConversation(conversationId, { limit: 100 })
      const rows = safeArray(res.data?.items).map((item) =>
        mapMessage(item.message as Record<string, unknown>, item.attachments),
      )
      setMessages(rows)
      setCanSend(Boolean(res.data.canSend) && !readOnly)
      setLocked(Boolean((res.data.conversation as { isLocked?: boolean })?.isLocked))
      setEditWindowMs(res.data.editWindowMs ?? 15 * 60 * 1000)
      setStatus(rows.length ? 'success' : 'empty')
      await messagesApi.markRead(conversationId)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
      setStatus('error')
    }
  }, [conversationId, readOnly])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!conversationId) return
    joinConversationRoom(conversationId)
    return () => {
      leaveConversationRoom(conversationId)
      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current)
        typingTimer.current = null
      }
      emitTypingStop(conversationId)
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId || !appDownload) return
    const timer = window.setTimeout(() => appDownload.signalEngagement('open_chat'), 1_500)
    return () => window.clearTimeout(timer)
  }, [appDownload, conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [messages, typingUser])

  useSocketEvent(SOCKET_EVENTS.MESSAGE_NEW, (payload: { conversationId?: string; message?: Record<string, unknown> }) => {
    if (payload.conversationId !== conversationId || !payload.message) return
    const row = mapMessage(payload.message)
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    setStatus('success')
    if (row.senderId !== user?.id) {
      void messagesApi.markDelivered(row.id)
      void messagesApi.markRead(conversationId)
    }
  })

  useSocketEvent(SOCKET_EVENTS.MESSAGE_EDITED, (payload: { conversationId?: string; message?: Record<string, unknown> }) => {
    if (payload.conversationId !== conversationId || !payload.message) return
    const row = mapMessage(payload.message)
    setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)))
  })

  useSocketEvent(SOCKET_EVENTS.MESSAGE_DELETED, (payload: { conversationId?: string; messageId?: string }) => {
    if (payload.conversationId !== conversationId || !payload.messageId) return
    setMessages((prev) => prev.filter((m) => m.id !== payload.messageId))
  })

  useSocketEvent(SOCKET_EVENTS.TYPING_STARTED, (payload: { conversationId?: string; userId?: string }) => {
    if (payload.conversationId !== conversationId || payload.userId === user?.id) return
    setTypingUser(payload.userId ?? 'Someone')
  })

  useSocketEvent(SOCKET_EVENTS.TYPING_STOPPED, (payload: { conversationId?: string; userId?: string }) => {
    if (payload.conversationId !== conversationId) return
    setTypingUser(null)
  })

  useSocketEvent(SOCKET_EVENTS.CONVERSATION_UPDATED, (payload: { conversation?: { _id?: string; id?: string; isLocked?: boolean } }) => {
    const id = payload.conversation?._id ?? payload.conversation?.id
    if (String(id) !== conversationId) return
    setLocked(Boolean(payload.conversation?.isLocked))
    setCanSend(!readOnly && !payload.conversation?.isLocked)
  })

  const onDraftChange = (value: string) => {
    setDraft(value)
    if (!canSend) return
    emitTypingStart(conversationId)
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => emitTypingStop(conversationId), 1200)
  }

  const sendText = async () => {
    const text = draft.trim()
    if (!text || !canSend) return
    setSending(true)
    setError(null)
    const clientMessageId = pendingClientMessageId.current ?? newClientMessageId('c')
    pendingClientMessageId.current = clientMessageId
    try {
      emitTypingStop(conversationId)
      const res = await messagesApi.send({
        conversationId,
        body: text,
        type: 'text',
        clientMessageId,
      })
      const row = mapMessage(res.data.message)
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
      setDraft('')
      pendingClientMessageId.current = null
      setStatus('success')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const sendLocation = async () => {
    if (!canSend) return
    setSending(true)
    try {
      let lat: number | null = null
      let lng: number | null = null

      if (locationPermission) {
        const ensured = await locationPermission.ensureLocation('share_location')
        if (ensured.coords) {
          lat = ensured.coords.latitude
          lng = ensured.coords.longitude
        } else if (ensured.status === 'granted') {
          const { getCurrentPosition } = await import('@fixnow/native')
          const coords = await getCurrentPosition(10_000, { requestPermission: false })
          if (coords) {
            lat = coords.latitude
            lng = coords.longitude
          }
        }
      } else {
        const { getCurrentPosition } = await import('@fixnow/native')
        const coords = await getCurrentPosition(10_000, { requestPermission: false })
        if (coords) {
          lat = coords.latitude
          lng = coords.longitude
        }
      }

      if (lat == null || lng == null) {
        setError('Location is unavailable. Enable location in Settings to share it.')
        return
      }

      const res = await messagesApi.send({
        conversationId,
        body: 'Shared location',
        type: 'location',
        location: {
          lat,
          lng,
          label: 'Current location',
        },
        clientMessageId: newClientMessageId('loc'),
      })
      const row = mapMessage(res.data.message)
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
      setStatus('success')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const sendImage = async (file: File) => {
    if (!canSend) return
    setSending(true)
    try {
      const uploaded = await messagesApi.uploadImage(file)
      const res = await messagesApi.send({
        conversationId,
        body: file.name || 'Image',
        type: 'image',
        attachmentUrl: uploaded.upload.url,
        attachmentMimeType: uploaded.upload.mimeType,
        clientMessageId: newClientMessageId('img'),
      })
      const row = mapMessage(res.data.message)
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
      setStatus('success')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const editMessage = async (id: string, createdAt: string) => {
    if (Date.now() - new Date(createdAt).getTime() > editWindowMs) {
      setError('Edit window has expired')
      return
    }
    const next = window.prompt('Edit message')
    if (!next?.trim()) return
    try {
      const res = await messagesApi.edit(id, next.trim())
      const row = mapMessage(res.data.message)
      setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)))
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  const deleteMessage = async (id: string) => {
    if (!window.confirm('Delete this message?')) return
    try {
      await messagesApi.remove(id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  const subtitle = useMemo(() => {
    if (locked) return 'Closed · read-only'
    if (readOnly) return 'Admin view · read-only'
    if (typingUser) return 'Typing…'
    return 'Secure job conversation'
  }, [locked, readOnly, typingUser])

  return (
    <div className="flex h-[min(70vh,720px)] min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-canvas-white md:min-h-0">
      <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          {backHref ? (
            <a href={backHref} className="text-label text-primary">
              ← Back
            </a>
          ) : null}
          <h2 className="text-title-md text-on-surface">{title}</h2>
          <p className="text-label text-on-surface-variant">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="tap-target touch-manip -mr-2 rounded-lg px-2 text-sm font-semibold text-primary"
        >
          Refresh
        </button>
      </header>

      {error ? <div className="bg-error/5 px-4 py-2 text-sm text-error">{error}</div> : null}

      <div className="scroll-touch flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <AsyncStateView
          status={status === 'success' ? 'success' : status}
          error={error}
          onRetry={() => void reload()}
          emptyTitle="No messages yet"
          emptyHint="Say hello to start the conversation."
        >
          {messages.map((m) => {
            const mine = m.senderId === user?.id
            const system = m.type === 'system'
            return (
              <div
                key={m.id}
                className={`flex ${system ? 'justify-center' : mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    system
                      ? 'bg-surface-container-low text-on-surface-variant'
                      : mine
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  {m.type === 'image' && m.attachmentUrl ? (
                    <LazyImage src={m.attachmentUrl} alt={m.body} className="mb-2 max-h-48 rounded-lg object-cover" />
                  ) : null}
                  {m.type === 'location' && m.meta?.location ? (
                    <a
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://maps.google.com/?q=${(m.meta.location as { lat: number; lng: number }).lat},${(m.meta.location as { lat: number; lng: number }).lng}`}
                    >
                      {m.body}
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  )}
                  <div className={`mt-1 flex gap-2 text-[10px] opacity-70 ${mine ? 'justify-end' : ''}`}>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                    {m.editedAt ? <span>edited</span> : null}
                    {mine && m.deliveredAt ? <span>delivered</span> : null}
                  </div>
                  {mine && !system && canSend ? (
                    <div className="mt-1 flex gap-1 text-[11px] opacity-90">
                      <button
                        type="button"
                        className="touch-manip rounded px-2 py-1"
                        onClick={() => void editMessage(m.id, m.createdAt)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="touch-manip rounded px-2 py-1"
                        onClick={() => void deleteMessage(m.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </AsyncStateView>
      </div>

      {canSend ? (
        <footer className="keyboard-inset border-t border-border-subtle p-3">
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Add attachment"
              className="tap-target touch-manip press-effect flex shrink-0 items-center justify-center rounded-full border border-border-subtle text-primary disabled:opacity-50"
              onClick={() => setAttachOpen(true)}
              disabled={sending}
            >
              <span className="text-2xl leading-none">＋</span>
            </button>
            <input
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendText()
                }
              }}
              placeholder="Type a message…"
              enterKeyHint="send"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border-subtle px-3 outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void sendText()}
              className="tap-target touch-manip press-effect shrink-0 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void sendImage(file)
              e.target.value = ''
            }}
          />
        </footer>
      ) : (
        <div className="border-t border-border-subtle px-4 py-3 text-center text-sm text-on-surface-variant">
          {locked ? 'This conversation is closed.' : 'Read-only'}
        </div>
      )}

      <BottomSheet open={attachOpen} onClose={() => setAttachOpen(false)} title="Add to message">
        <div className="grid gap-2">
          <button
            type="button"
            data-autofocus
            className="tap-target touch-manip press-effect flex w-full items-center gap-3 rounded-xl border border-border-subtle px-4 text-left font-semibold text-on-surface disabled:opacity-50"
            onClick={() => {
              setAttachOpen(false)
              fileRef.current?.click()
            }}
            disabled={sending}
          >
            <span className="text-xl">🖼️</span> Photo
          </button>
          <button
            type="button"
            className="tap-target touch-manip press-effect flex w-full items-center gap-3 rounded-xl border border-border-subtle px-4 text-left font-semibold text-on-surface disabled:opacity-50"
            onClick={() => {
              setAttachOpen(false)
              void sendLocation()
            }}
            disabled={sending}
          >
            <span className="text-xl">📍</span> Share location
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
