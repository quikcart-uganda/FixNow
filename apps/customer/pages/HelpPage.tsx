import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Icon } from '@fixnow/ui'
import { contentApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, CmsDocumentView } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'

const QUICK_LINKS = [
  { slug: 'faq', label: 'FAQ', icon: 'quiz' },
  { slug: 'about', label: 'About FixNow', icon: 'info' },
  { slug: 'safety-tips', label: 'Safety tips', icon: 'health_and_safety' },
  { slug: 'trust-verification', label: 'Trust & verification', icon: 'verified_user' },
  { slug: 'terms', label: 'Terms', icon: 'gavel' },
  { slug: 'privacy-policy', label: 'Privacy', icon: 'policy' },
  { slug: 'refund-policy', label: 'Refunds', icon: 'payments' },
  { slug: 'delete-account', label: 'Delete account info', icon: 'person_off' },
]

export function HelpPage() {
  const [q, setQ] = useState('')
  const search = useAsync(async () => {
    if (!q.trim()) return [] as Array<{ id: string; title: string; slug: string; excerpt?: string }>
    const res = await contentApi.search({ q: q.trim(), audience: 'customer' })
    return safeArray(res.data?.items)
  }, [q])

  useRealtimeReload(() => void search.reload(), [SOCKET_EVENTS.CONTENT_UPDATED])

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to="/customer/profile" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-title-md">Help Center</h1>
      </header>

      <section className="space-y-4 p-4">
        <CmsDocumentView slug="help" audience="customer" titleFallback="Help Centre" />

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">Search help</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search FAQ, policies, guides…"
            className="w-full rounded-xl border border-border-subtle bg-canvas-white px-4 py-3"
          />
        </label>

        {q.trim() ? (
          <AsyncStateView status={search.status} error={search.error} onRetry={() => void search.reload()} emptyTitle="No results">
            <div className="space-y-2">
              {safeArray(search.data).map((item) => (
                <Link
                  key={item.id}
                  to={`/customer/content/${item.slug}`}
                  className="block rounded-xl border border-border-subtle bg-canvas-white p-4"
                >
                  <p className="font-semibold">{item.title}</p>
                  {item.excerpt ? <p className="mt-1 text-sm text-on-surface-variant">{item.excerpt}</p> : null}
                </Link>
              ))}
            </div>
          </AsyncStateView>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.slug}
                to={`/customer/content/${link.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white p-4"
              >
                <Icon name={link.icon} className="text-primary" />
                <span className="text-sm font-semibold">{link.label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
