import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet, Icon } from '@fixnow/ui'

const QUICK_TARGETS = [
  { id: 'technicians', label: 'Technicians', icon: 'engineering', to: '/admin/technicians', hint: 'Find and manage technician accounts' },
  { id: 'customers', label: 'Customers', icon: 'group', to: '/admin/customers', hint: 'Customer accounts and activity' },
  { id: 'jobs', label: 'Jobs', icon: 'work', to: '/admin/jobs', hint: 'Marketplace jobs and assignments' },
  { id: 'verification', label: 'Verification', icon: 'verified_user', to: '/admin/verification', hint: 'Pending identity and skill reviews' },
  { id: 'audit', label: 'Audit logs', icon: 'history', to: '/admin/audit', hint: 'Operational audit trail' },
] as const

/**
 * Admin header search — never a dead field.
 * Typing + Enter (or picking a target) navigates to a real admin list with `q`.
 */
export function HeaderAdminSearch({ className = '' }: { className?: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()

  const go = (base: string) => {
    const q = query.trim()
    setOpen(false)
    navigate(q ? `${base}?q=${encodeURIComponent(q)}` : base)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) {
      setNotice('Enter a name, job, or keyword — or choose a section below.')
      setOpen(true)
      return
    }
    // Default: technicians list with query (most common ops search).
    go('/admin/technicians')
  }

  return (
    <>
      <form onSubmit={onSubmit} className={`relative hidden min-w-0 w-full max-w-md md:block ${className}`}>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setNotice(null)
            setOpen(true)
          }}
          className="min-h-11 w-full rounded-lg border border-outline-variant bg-surface-alt py-2 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          placeholder="Search technicians, jobs, customers…"
          aria-label="Search technicians, jobs, customers"
        />
      </form>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Admin search"
        description="Jump to a section or search with your keyword."
      >
        <form onSubmit={onSubmit} className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-border-subtle px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Type a keyword…"
            aria-label="Search keyword"
          />
        </form>
        {notice ? (
          <p className="mb-3 rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface" role="status">
            {notice}
          </p>
        ) : null}
        <ul className="space-y-1 pb-6">
          {QUICK_TARGETS.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                onClick={() => go(target.to)}
                className="tap-target flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface-container-low"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={target.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-on-surface">{target.label}</span>
                  <span className="block text-xs text-on-surface-variant">
                    {query.trim() ? `Search “${query.trim()}” in ${target.label.toLowerCase()}` : target.hint}
                  </span>
                </span>
                <Icon name="chevron_right" className="text-on-surface-variant" />
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  )
}
