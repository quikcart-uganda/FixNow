import { useId, useMemo, useState } from 'react'
import { cn } from '@fixnow/utils'
import { Icon } from '../ui'

export type CmsIconOption = {
  value: string
  label: string
  group: string
}

/** Visual icon catalogue for CMS (Material Symbols names — compatible with existing Icon). */
export const CMS_ICON_CATALOGUE: CmsIconOption[] = [
  // Electrical / trades
  { value: 'electrical_services', label: 'Electrical', group: 'Electrical' },
  { value: 'bolt', label: 'Power', group: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing', group: 'Plumbing' },
  { value: 'water_drop', label: 'Water', group: 'Plumbing' },
  { value: 'cleaning_services', label: 'Cleaning', group: 'Cleaning' },
  { value: 'sanitizer', label: 'Sanitize', group: 'Cleaning' },
  { value: 'security', label: 'Security', group: 'Security' },
  { value: 'videocam', label: 'CCTV', group: 'Security' },
  { value: 'lock', label: 'Lock', group: 'Security' },
  { value: 'foundation', label: 'Construction', group: 'Construction' },
  { value: 'carpenter', label: 'Carpentry', group: 'Construction' },
  { value: 'roofing', label: 'Roofing', group: 'Construction' },
  { value: 'yard', label: 'Garden', group: 'Garden' },
  { value: 'grass', label: 'Lawn', group: 'Garden' },
  { value: 'emergency', label: 'Emergency', group: 'Emergency' },
  { value: 'e911_emergency', label: 'Urgent', group: 'Emergency' },
  { value: 'business_center', label: 'Business', group: 'Business' },
  { value: 'storefront', label: 'Storefront', group: 'Business' },
  { value: 'payments', label: 'Payments', group: 'Payments' },
  { value: 'account_balance_wallet', label: 'Wallet', group: 'Payments' },
  { value: 'notifications', label: 'Notifications', group: 'Notifications' },
  { value: 'campaign', label: 'Campaign', group: 'Notifications' },
  { value: 'verified_user', label: 'Verified', group: 'Verification' },
  { value: 'badge', label: 'Badge', group: 'Verification' },
  { value: 'local_offer', label: 'Offer', group: 'Marketing' },
  { value: 'featured_seasonal_and_gifts', label: 'Featured', group: 'Marketing' },
  { value: 'newspaper', label: 'News', group: 'Marketing' },
  { value: 'article', label: 'Article', group: 'Marketing' },
  { value: 'school', label: 'Education', group: 'Marketing' },
  { value: 'help', label: 'Help', group: 'Marketing' },
  { value: 'info', label: 'Info', group: 'Marketing' },
  { value: 'handshake', label: 'Trust', group: 'Marketing' },
  { value: 'star', label: 'Star', group: 'Marketing' },
]

type Props = {
  value: string
  onChange: (icon: string) => void
  label?: string
}

export function ContentIconPicker({ value, onChange, label = 'Icon' }: Props) {
  const triggerId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')

  const groups = useMemo(
    () => ['All', ...Array.from(new Set(CMS_ICON_CATALOGUE.map((i) => i.group)))],
    [],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CMS_ICON_CATALOGUE.filter((i) => {
      if (group !== 'All' && i.group !== group) return false
      if (!q) return true
      return i.label.toLowerCase().includes(q) || i.value.includes(q) || i.group.toLowerCase().includes(q)
    })
  }, [query, group])

  const selected = CMS_ICON_CATALOGUE.find((i) => i.value === value)

  return (
    <div className="space-y-1.5">
      <label htmlFor={triggerId} className="text-sm font-semibold text-ink-secondary">
        {label}
      </label>
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm touch-manipulation hover:border-primary/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={value || 'help'} className="!text-[22px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink-primary">{selected?.label || 'Choose an icon'}</span>
          <span className="block text-xs text-ink-muted">{selected?.group || 'Visual catalogue'}</span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} />
      </button>

      {open ? (
        <div className="rounded-xl border border-border bg-canvas p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              className="min-h-9 flex-1 rounded-lg border border-border px-3 text-sm"
              placeholder="Search icons…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search icons"
            />
            <select
              className="min-h-9 rounded-lg border border-border px-2 text-sm"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Icon category"
            >
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-4 md:grid-cols-6">
            {filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                title={item.label}
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition touch-manipulation',
                  value === item.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent hover:border-border hover:bg-surface-alt',
                )}
              >
                <Icon name={item.value} className="!text-[22px]" />
                <span className="line-clamp-1 text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
