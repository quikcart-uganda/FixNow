import { useState } from 'react'
import { notificationsApi, getFriendlyErrorMessage, timeAgo } from '@fixnow/api'
import { useAsync, usePush } from '@fixnow/hooks'
import { Button } from '@fixnow/ui'
import { safeArray, safeObject, safeString } from '@fixnow/utils'
import { AsyncStateView } from './AsyncStateView'

type Row = {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  time: string
}

export function NotificationsInbox() {
  const push = usePush()
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useAsync(async () => {
    const res = await notificationsApi.list({ limit: 50 })
    void push.refreshBadge()
    return safeArray(res.data?.items).map((raw) => {
      const n = safeObject(raw)
      return {
        id: safeString(n._id ?? n.id),
        title: safeString(n.title, 'Notification'),
        body: safeString(n.body),
        type: safeString(n.type),
        read: Boolean(n.readAt),
        time: n.createdAt ? timeAgo(String(n.createdAt)) : '',
      } satisfies Row
    })
  }, [], { cacheKey: 'notifications.v1' })

  const prefsQuery = useAsync(async () => {
    const res = await notificationsApi.getPreferences()
    return res.data.preferences
  }, [])

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline">Notifications</h1>
          <p className="text-body text-on-surface-variant">
            Jobs · assignments · messages · account alerts
            {push.unreadCount > 0 ? ` · ${push.unreadCount} unread` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {push.permission !== 'granted' ? (
            <Button
              variant="outline"
              onClick={() => {
                setActionError(null)
                void push.requestPermissionAndRegister().catch((err) => setActionError(getFriendlyErrorMessage(err)))
              }}
            >
              Enable push
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              setActionError(null)
              void push
                .markAllRead()
                .then(() => void query.reload())
                .catch((err) => setActionError(getFriendlyErrorMessage(err)))
            }}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {push.lastError ? <p className="text-sm text-error">{push.lastError}</p> : null}
      {actionError ? <p className="text-sm text-error">{actionError}</p> : null}

      {prefsQuery.data ? (
        <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
          <h2 className="text-title">Push preferences</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {(
              [
                ['push', 'Push enabled'],
                ['marketplace', 'Marketplace'],
                ['messaging', 'Messaging'],
                ['auth', 'Account'],
                ['sound', 'Sound'],
                ['badge', 'Badge'],
              ] as const
            ).map(([key, label]) => {
              const prefs = prefsQuery.data!
              const channels = (prefs.channels || {}) as Record<string, boolean>
              const categories = (prefs.categories || {}) as Record<string, boolean>
              const checked =
                key === 'push'
                  ? channels.push !== false
                  : key === 'sound'
                    ? prefs.sound !== false
                    : key === 'badge'
                      ? prefs.badge !== false
                      : categories[key] !== false
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      void (async () => {
                        try {
                          setPrefsError(null)
                          const body =
                            key === 'push'
                              ? { channels: { push: e.target.checked } }
                              : key === 'sound' || key === 'badge'
                                ? { [key]: e.target.checked }
                                : { categories: { [key]: e.target.checked } }
                          await notificationsApi.updatePreferences(body)
                          await prefsQuery.reload()
                        } catch (err) {
                          setPrefsError(getFriendlyErrorMessage(err))
                        }
                      })()
                    }}
                  />
                  {label}
                </label>
              )
            })}
          </div>
          {prefsError ? <p className="mt-2 text-sm text-error">{prefsError}</p> : null}
        </div>
      ) : null}

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle="No notifications yet"
        emptyHint="Job alerts, messages, and account updates will appear here."
      >
        <div className="space-y-3">
          {safeArray<Row>(query.data).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`w-full rounded-2xl border border-border-subtle p-4 text-left transition hover:bg-surface-container-low ${
                n.read ? 'bg-canvas-white' : 'bg-primary/5'
              }`}
              onClick={() => {
                setActionError(null)
                void notificationsApi
                  .markRead(n.id)
                  .then(() => {
                    void query.reload()
                    void push.refreshBadge()
                  })
                  .catch((err) => setActionError(getFriendlyErrorMessage(err)))
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-on-surface">{n.title}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{n.body}</p>
                  <p className="mt-2 text-xs text-outline">{n.type}</p>
                </div>
                <span className="shrink-0 text-xs text-outline">{n.time}</span>
              </div>
            </button>
          ))}
        </div>
      </AsyncStateView>
    </div>
  )
}
