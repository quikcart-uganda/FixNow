import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Card, Icon } from '@fixnow/ui'
import { contentApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, CmsDocumentView } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'

const QUICK_LINKS = [
  { slug: 'faq', label: 'FAQ' },
  { slug: 'trust-verification', label: 'Trust & verification' },
  { slug: 'terms', label: 'Terms' },
  { slug: 'privacy-policy', label: 'Privacy' },
  { slug: 'refund-policy', label: 'Refunds' },
  { slug: 'delete-account', label: 'Delete account info' },
]

export function HelpPage() {
  const [q, setQ] = useState('')
  const search = useAsync(async () => {
    if (!q.trim()) return [] as Array<{ id: string; title: string; slug: string; excerpt?: string }>
    const res = await contentApi.search({ q: q.trim(), audience: 'technician' })
    return safeArray(res.data?.items)
  }, [q])

  useRealtimeReload(() => void search.reload(), [SOCKET_EVENTS.CONTENT_UPDATED])

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Help Center</h1>
        <p className="text-body text-on-surface-variant">Policies and guides load live from FixNow CMS</p>
      </div>

      <CmsDocumentView slug="help" audience="technician" />

      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
          <Icon name="support_agent" />
        </div>
        <div>
          <p className="text-title">Chat with FixNow Support</p>
          <p className="text-label text-on-surface-variant">Use in-app messages for active jobs</p>
        </div>
      </Card>

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">Search</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search FAQ, policies, guides…"
          className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-3"
        />
      </label>

      {q.trim() ? (
        <AsyncStateView status={search.status} error={search.error} onRetry={() => void search.reload()} emptyTitle="No results">
          <div className="space-y-3">
            {safeArray(search.data).map((item) => (
              <Link key={item.id} to={`/technician/content/${item.slug}`}>
                <Card className="p-4">
                  <p className="text-title">{item.title}</p>
                  {item.excerpt ? <p className="mt-2 text-label text-on-surface-variant">{item.excerpt}</p> : null}
                </Card>
              </Link>
            ))}
          </div>
        </AsyncStateView>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <Link key={link.slug} to={`/technician/content/${link.slug}`}>
              <Card className="p-4">
                <p className="text-title">{link.label}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
