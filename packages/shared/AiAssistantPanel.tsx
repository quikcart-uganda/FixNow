import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  aiApi,
  getFriendlyErrorMessage,
  type AiAssistantRole,
  type AiChatContext,
  type AiChatResult,
  type AiStatus,
} from '@fixnow/api'
import { useAuth } from '@fixnow/hooks'
import { safeArray, safeObject, safeString } from '@fixnow/utils'
import { AiComposer } from './ai/AiComposer'
import { AiInfoSheet } from './ai/AiInfoSheet'
import { AiLanding } from './ai/AiLanding'
import { AiMessageBubble, AiTypingIndicator } from './ai/AiMessageBubble'
import { AiSidePanel } from './ai/AiSidePanel'
import { detectAiMediaCapabilities } from './ai/capabilities'
import {
  getFirstName,
  loadAiPrefs,
  loadPinnedIds,
  newAiId,
  roleCopy,
  saveAiPrefs,
  savePinnedIds,
} from './ai/roleCopy'
import { getGuestSession, trackGuestEvent } from './auth/guestSession'
import type {
  AiAttachment,
  AiConversationSummary,
  AiLocalPrefs,
  AiPanelMode,
  AiTurn,
} from './ai/types'
import { useAiAttachments } from './ai/useAiAttachments'
import { useAiVoice } from './ai/useAiVoice'

async function sendToRole(
  role: AiAssistantRole,
  body: {
    message: string
    conversationId?: string
    context?: AiChatContext
    inputMode?: 'text' | 'voice' | 'image'
    attachments?: Array<{
      kind: string
      name: string
      url?: string
      mimeType?: string
    }>
    guestSessionId?: string
  },
  guestMode = false,
) {
  if (guestMode) return aiApi.chatGuest(body)
  if (role === 'technician') return aiApi.chatTechnician(body)
  if (role === 'admin') return aiApi.chatAdmin(body)
  return aiApi.chatCustomer(body)
}

export function AiAssistantPanel({
  role,
  context,
  title,
  onClose,
  onMinimize,
  className,
  guestMode = false,
}: {
  role: AiAssistantRole
  context?: AiChatContext
  title?: string
  onClose?: () => void
  onMinimize?: () => void
  className?: string
  guestMode?: boolean
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const copy = roleCopy(role)
  const heading = title ?? copy.title
  const firstName = guestMode ? 'Guest' : getFirstName(user?.fullName)
  const userId = guestMode ? 'guest' : user?.id || 'anon'

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'off' | 'error'>('loading')
  const [turns, setTurns] = useState<AiTurn[]>([])
  const [mode, setMode] = useState<AiPanelMode>('landing')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [thinkingLabel, setThinkingLabel] = useState(copy.statusThinking)
  const [error, setError] = useState<string | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [sheet, setSheet] = useState<'settings' | 'help' | 'privacy' | null>(null)
  const [conversations, setConversations] = useState<AiConversationSummary[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPinnedIds(role, String(userId)))
  const [prefs, setPrefs] = useState<AiLocalPrefs>(() => loadAiPrefs())
  const [isDesktop, setIsDesktop] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const capabilities = useMemo(() => detectAiMediaCapabilities(), [])

  const attachmentsApi = useAiAttachments({
    allowFiles: role === 'admin' || role === 'technician',
    enabled: statusState === 'ready',
  })
  const voice = useAiVoice(statusState === 'ready' && capabilities.voiceRecord)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const apply = () => {
      const desktop = mq.matches
      setIsDesktop(desktop)
      setSideOpen(desktop)
    }
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    setPinnedIds(loadPinnedIds(role, String(userId)))
  }, [role, userId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await aiApi.status()
        if (cancelled) return
        setAiStatus(res.data)
        setStatusState(res.data.enabled && res.data.roles[role] ? 'ready' : 'off')
      } catch (err) {
        if (cancelled) return
        setError(getFriendlyErrorMessage(err))
        setStatusState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [role])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, sending, mode])

  useEffect(() => {
    if (!sending) {
      setThinkingLabel(copy.statusThinking)
      return
    }
    const labels =
      role === 'technician'
        ? ['Thinking…', 'Reviewing your request…', 'Checking your technician profile…']
        : role === 'admin'
          ? ['Thinking…', 'Reviewing your request…', 'Checking platform context…']
          : ['Thinking…', 'Reviewing your request…', 'Checking your account…']
    let i = 0
    setThinkingLabel(labels[0]!)
    const id = window.setInterval(() => {
      i = (i + 1) % labels.length
      setThinkingLabel(labels[i]!)
    }, 2200)
    return () => window.clearInterval(id)
  }, [sending, role, copy.statusThinking])

  const loadConversations = useCallback(async () => {
    if (guestMode) {
      setConversations([])
      return
    }
    try {
      const res = await aiApi.listConversations()
      const pins = loadPinnedIds(role, String(userId))
      const items = safeArray(res.data?.items).map((raw) => {
        const row = safeObject(raw)
        const id = safeString(row._id ?? row.id)
        return {
          id,
          title: safeString(row.title, 'Conversation'),
          updatedAt: safeString(row.updatedAt ?? row.lastMessageAt),
          pinned: pins.includes(id),
        } satisfies AiConversationSummary
      })
      items.sort((a, b) => Number(b.pinned) - Number(a.pinned))
      setConversations(items)
    } catch {
      /* history optional */
    }
  }, [role, userId, guestMode])

  useEffect(() => {
    if (statusState === 'ready') void loadConversations()
  }, [statusState, loadConversations])

  const persistPins = (ids: string[]) => {
    setPinnedIds(ids)
    savePinnedIds(role, String(userId), ids)
    setConversations((prev) =>
      prev
        .map((c) => ({ ...c, pinned: ids.includes(c.id) }))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    )
  }

  const startNewChat = () => {
    setConversationId(undefined)
    setTurns([])
    setMode('landing')
    setError(null)
    setSideOpen(false)
    attachmentsApi.clear()
    voice.cancel()
  }

  const openConversation = async (id: string) => {
    setSideOpen(false)
    setConversationId(id)
    setError(null)
    setMode('conversation')
    try {
      const res = await aiApi.listMessages(id)
      const mapped: AiTurn[] = safeArray(res.data?.items).map((raw) => {
        const row = safeObject(raw)
        const sender = safeString(row.sender) === 'user' ? 'user' : 'assistant'
        const meta = safeObject(row.metadata)
        return {
          id: safeString(row._id ?? row.id, newAiId('m')),
          sender,
          text: safeString(row.content),
          createdAt: safeString(row.createdAt, new Date().toISOString()),
          inputMode: meta.inputMode === 'voice' || meta.inputMode === 'image' ? meta.inputMode : 'text',
        }
      })
      setTurns(mapped)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  const send = useCallback(
    async (text: string, opts?: { attachments?: AiAttachment[]; inputMode?: 'text' | 'voice' | 'image' }) => {
      const message = text.trim()
      const atts = (opts?.attachments ?? attachmentsApi.readyAttachments).filter((a) => a.url)
      if ((!message && !atts.length) || sending || statusState !== 'ready') return
      if (attachmentsApi.busy) return

      const inputMode =
        opts?.inputMode ||
        (atts.some((a) => a.kind === 'image') ? 'image' : atts.length ? 'image' : 'text')

      const composed =
        message ||
        (atts.length
          ? atts.some((a) => a.kind === 'image')
            ? 'I attached a photo — please help based on this.'
            : 'I attached a file — please help based on this.'
          : '')

      setDraft('')
      setError(null)
      setSending(true)
      setMode('conversation')

      const userTurn: AiTurn = {
        id: newAiId('u'),
        sender: 'user',
        text: composed,
        createdAt: new Date().toISOString(),
        attachments: atts.map((a) => ({ ...a })),
        inputMode,
      }
      setTurns((prev) => [...prev, userTurn])
      attachmentsApi.clear()

      try {
        if (guestMode) trackGuestEvent('guest_ai_chat')
        const guestSessionId = guestMode ? getGuestSession()?.sessionId : undefined
        const safeContext = guestMode
          ? {
              screen: typeof window !== 'undefined' ? window.location.pathname : undefined,
              technicianId: context?.technicianId,
              categoryId: context?.categoryId,
              district: context?.district,
              query: context?.query,
            }
          : {
              screen: typeof window !== 'undefined' ? window.location.pathname : undefined,
              ...context,
              attachments: atts.map((a) => ({
                kind: a.kind,
                name: a.name,
                url: a.url,
                mimeType: a.mimeType,
              })),
              inputMode,
            }
        const res = await sendToRole(
          role,
          {
            message: composed,
            conversationId: guestMode ? undefined : conversationId,
            inputMode: guestMode ? 'text' : inputMode,
            attachments: guestMode
              ? undefined
              : atts.map((a) => ({
                  kind: a.kind,
                  name: a.name,
                  url: a.url,
                  mimeType: a.mimeType,
                })),
            context: safeContext,
            guestSessionId,
          },
          guestMode,
        )
        const result: AiChatResult = res.data
        if (result.conversationId) setConversationId(result.conversationId)
        setTurns((prev) => [
          ...prev,
          {
            id: newAiId('a'),
            sender: 'assistant',
            text: result.message,
            createdAt: new Date().toISOString(),
            tools: result.toolResults?.filter((t) => t.ok),
            suggestions: result.suggestions,
            deepLinks: result.deepLinks,
            pendingActions: result.pendingActions,
            navigateTo: result.navigateTo,
          },
        ])
        if (result.navigateTo) {
          // Soft navigate — user can still tap deep links; auto-open when AI requested a screen.
          try {
            navigate(result.navigateTo)
            onClose?.()
          } catch {
            /* ignore */
          }
        }
        if (result.disabled) setStatusState('off')
        void loadConversations()
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setSending(false)
      }
    },
    [
      attachmentsApi,
      context,
      conversationId,
      loadConversations,
      navigate,
      onClose,
      role,
      sending,
      statusState,
    ],
  )

  const confirmPending = useCallback(
    async (actionId: string) => {
      if (guestMode) return
      setActionBusyId(actionId)
      setError(null)
      try {
        const res = await aiApi.confirmAction(actionId)
        const summary = res.data?.result?.summary || 'Action completed through FixNow.'
        const links = res.data?.result?.deepLinks
        setTurns((prev) => [
          ...prev,
          {
            id: newAiId('a'),
            sender: 'assistant',
            text: summary,
            createdAt: new Date().toISOString(),
            deepLinks: links,
          },
        ])
        setTurns((prev) =>
          prev.map((t) =>
            t.pendingActions?.some((p) => p.id === actionId)
              ? {
                  ...t,
                  pendingActions: t.pendingActions?.filter((p) => p.id !== actionId),
                }
              : t,
          ),
        )
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setActionBusyId(null)
      }
    },
    [guestMode],
  )

  const cancelPending = useCallback(
    async (actionId: string) => {
      if (guestMode) return
      setActionBusyId(actionId)
      try {
        await aiApi.cancelAction(actionId)
        setTurns((prev) =>
          prev.map((t) =>
            t.pendingActions?.some((p) => p.id === actionId)
              ? {
                  ...t,
                  pendingActions: t.pendingActions?.filter((p) => p.id !== actionId),
                  text: t.text,
                }
              : t,
          ),
        )
        setTurns((prev) => [
          ...prev,
          {
            id: newAiId('a'),
            sender: 'assistant',
            text: 'Cancelled. Nothing was changed on the platform.',
            createdAt: new Date().toISOString(),
          },
        ])
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setActionBusyId(null)
      }
    },
    [guestMode],
  )

  const headerStatus =
    statusState === 'loading'
      ? 'Connecting…'
      : statusState === 'ready'
        ? sending
          ? thinkingLabel
          : voice.phase === 'recording' || voice.phase === 'canceling'
            ? copy.statusListening
            : voice.phase === 'transcribing'
              ? 'Transcribing…'
              : copy.statusReady
        : copy.statusUnavailable

  const placeholder = isDesktop ? copy.placeholder : copy.placeholderMobile

  const onQuickAction = (action: string) => {
    if (action === 'camera') void attachmentsApi.addFromCamera()
    else if (action === 'gallery') void attachmentsApi.addFromGallery()
    else if (action === 'voice') void voice.start()
    else if (action === 'help') setSheet('help')
  }

  const onVoiceRelease = async () => {
    const payload = await voice.release()
    if (!payload) return
    const voiceAtt = payload.audioUrl
      ? [
          {
            id: newAiId('voice'),
            kind: 'voice' as const,
            name: `Voice · ${payload.durationSec}s`,
            url: payload.audioUrl,
            mimeType: payload.mimeType || 'audio/webm',
          },
        ]
      : undefined
    void send(payload.text, { inputMode: 'voice', attachments: voiceAtt })
  }

  const clearHistory = async () => {
    if (!window.confirm('Clear all assistant conversations for this role?')) return
    try {
      await Promise.all(conversations.map((c) => aiApi.deleteConversation(c.id)))
      persistPins([])
      startNewChat()
      await loadConversations()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  return (
    <div
      className={`fixnow-ai-panel relative flex h-full min-h-0 flex-col overflow-hidden bg-canvas-white ${className ?? ''}`}
    >
      <header className="fixnow-ai-header flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4 sm:pt-3">
        <button
          type="button"
          onClick={() => {
            setSideOpen((v) => !v)
            if (!sideOpen) void loadConversations()
          }}
          className="fixnow-ai-icon-btn"
          aria-label="Open conversations"
          aria-expanded={sideOpen}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        <div className="fixnow-ai-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10">
          <span className="material-symbols-outlined text-[1.1rem] text-white sm:text-[1.2rem]">
            auto_awesome
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.95rem] font-semibold tracking-tight text-on-surface sm:text-base">
            {heading}
          </h2>
          <p className="truncate text-[11px] font-medium text-on-surface-variant/90">{headerStatus}</p>
        </div>

        <div className="flex items-center gap-0.5">
          {isDesktop && statusState === 'ready' ? (
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:text-primary"
            >
              New
            </button>
          ) : null}
          {isDesktop && onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              className="fixnow-ai-icon-btn"
              aria-label="Minimise assistant"
            >
              <span className="material-symbols-outlined">remove</span>
            </button>
          ) : null}
          {onClose ? (
            <button type="button" onClick={onClose} className="fixnow-ai-icon-btn" aria-label="Close assistant">
              <span className="material-symbols-outlined">close</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <AiSidePanel
          open={sideOpen && statusState === 'ready'}
          onClose={() => setSideOpen(false)}
          conversations={conversations}
          activeId={conversationId}
          onNew={startNewChat}
          onOpen={(id) => void openConversation(id)}
          onDelete={(id) => {
            void (async () => {
              try {
                await aiApi.deleteConversation(id)
                if (conversationId === id) startNewChat()
                persistPins(pinnedIds.filter((p) => p !== id))
                await loadConversations()
              } catch (err) {
                setError(getFriendlyErrorMessage(err))
              }
            })()
          }}
          onTogglePin={(id) => {
            const next = pinnedIds.includes(id)
              ? pinnedIds.filter((p) => p !== id)
              : [...pinnedIds, id]
            persistPins(next)
          }}
          onClearAll={() => void clearHistory()}
          onOpenSettings={() => {
            setSideOpen(false)
            setSheet('settings')
          }}
          onOpenHelp={() => {
            setSideOpen(false)
            setSheet('help')
          }}
          onOpenPrivacy={() => {
            setSideOpen(false)
            setSheet('privacy')
          }}
          desktop={isDesktop}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {error ? <div className="bg-error/5 px-4 py-2 text-sm text-error">{error}</div> : null}

          {statusState === 'loading' ? (
            <div className="flex flex-1 items-center justify-center px-6 py-8">
              <p className="text-sm text-on-surface-variant">Checking assistant availability…</p>
            </div>
          ) : null}

          {statusState === 'off' || statusState === 'error' ? (
            <div className="flex flex-1 items-center justify-center px-6 py-8">
              <div className="max-w-sm rounded-2xl bg-surface-container-low px-4 py-5 text-center text-sm text-on-surface-variant">
                <p className="font-semibold text-on-surface">Assistant unavailable</p>
                <p className="mt-1.5 leading-relaxed">
                  The assistant is currently unavailable. Everything else in FixNow still works normally.
                </p>
              </div>
            </div>
          ) : null}

          {statusState === 'ready' && mode === 'landing' && turns.length === 0 ? (
            <AiLanding
              title={heading}
              greetingTitle={copy.greetingTitle(firstName)}
              greetingBody={copy.greetingBody}
              starters={copy.starters}
              quickActions={copy.quickActions.filter((a) => {
                if (a.action === 'camera') return capabilities.camera && prefs.showCamera
                if (a.action === 'gallery') return capabilities.images
                if (a.action === 'voice') return capabilities.voiceRecord && prefs.showMic
                return true
              })}
              onSendStarter={(prompt) => void send(prompt)}
              onPrefill={setDraft}
              onQuickAction={onQuickAction}
              disabled={sending}
            />
          ) : null}

          {statusState === 'ready' && (mode === 'conversation' || turns.length > 0) ? (
            <div className="fixnow-ai-thread flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:space-y-4 sm:px-5 sm:py-6">
              {turns.map((turn) => (
                <AiMessageBubble
                  key={turn.id}
                  turn={turn}
                  onSendSuggestion={(text) => void send(text)}
                  onNavigate={onClose}
                  onConfirmAction={(id) => void confirmPending(id)}
                  onCancelAction={(id) => void cancelPending(id)}
                  actionBusyId={actionBusyId}
                />
              ))}
              {sending ? <AiTypingIndicator label={thinkingLabel} /> : null}
              <div ref={bottomRef} />
            </div>
          ) : null}

          {aiStatus?.enabled && statusState === 'ready' ? (
            <p className="fixnow-ai-disclaimer px-4 pb-1.5 pt-0.5 text-center text-[11px] leading-relaxed text-on-surface-variant/80 sm:px-5">
              {copy.disclaimer}
            </p>
          ) : null}

          {statusState === 'ready' ? (
            <AiComposer
              draft={draft}
              onDraftChange={setDraft}
              onSend={() => void send(draft)}
              disabled={statusState !== 'ready'}
              sending={sending}
              placeholder={placeholder}
              capabilities={capabilities}
              prefs={prefs}
              attachments={attachmentsApi.attachments}
              onRemoveAttachment={attachmentsApi.remove}
              onPickGallery={() => void attachmentsApi.addFromGallery()}
              onPickCamera={() => void attachmentsApi.addFromCamera()}
              onPickFiles={(files) => void attachmentsApi.enqueueFiles(files)}
              voicePhase={voice.phase}
              voiceTranscript={voice.transcript}
              voiceDurationSec={voice.durationSec}
              voiceLevels={voice.levels}
              voiceSlideOffset={voice.slideOffset}
              voiceWillCancel={voice.willCancel}
              onVoicePointerDown={(x) => void voice.start(x)}
              onVoicePointerMove={voice.updateSlide}
              onVoicePointerUp={() => void onVoiceRelease()}
              onCancelVoice={voice.cancel}
              attachmentError={attachmentsApi.error}
              voiceError={voice.error}
              dragDropEnabled={capabilities.dragDrop}
            />
          ) : null}

          <AiInfoSheet
            kind={sheet}
            onClose={() => setSheet(null)}
            prefs={prefs}
            onPrefsChange={(next) => {
              setPrefs(next)
              saveAiPrefs(next)
            }}
            helpNote={copy.helpNote}
            privacyNote={copy.privacyNote}
          />
        </div>
      </div>
    </div>
  )
}
