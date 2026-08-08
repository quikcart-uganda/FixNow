import { useMemo, useState } from 'react'
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
  categoryIconLabel,
  filterCategoryIcons,
  groupCategoryIcons,
  type CategoryIconGroup,
} from '@fixnow/assets'
import { cn } from '@fixnow/utils'
import { Icon } from './ui'

export {
  CATEGORY_ICON_OPTIONS,
  CATEGORY_ICON_GROUPS,
  categoryIconLabel,
  filterCategoryIcons,
  groupCategoryIcons,
} from '@fixnow/assets'

type Props = {
  id?: string
  value: string
  onChange: (icon: string) => void
  label?: string
}

/**
 * Searchable, grouped category icon picker.
 * Persists Material Symbol name for backward compatibility with free-text icons.
 * Preview matches customer / technician / admin Icon rendering (same ligature + size).
 */
export function CategoryIconPicker({ id, value, onChange, label = 'Category icon' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<CategoryIconGroup | 'All'>('All')

  const selected = useMemo(() => {
    const match = CATEGORY_ICON_OPTIONS.find((o) => o.value === value)
    return (
      match ?? {
        value: value || 'handyman',
        label: categoryIconLabel(value || 'handyman'),
        group: 'General' as const,
        aliases: [] as string[],
      }
    )
  }, [value])

  const filtered = useMemo(() => filterCategoryIcons(query, group), [query, group])
  const sections = useMemo(() => groupCategoryIcons(filtered), [filtered])

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-primary">
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-left text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={selected.value} className="!text-[22px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink-primary">{selected.label}</span>
          <span className="block truncate text-xs text-ink-muted">
            {selected.value}
            {'group' in selected && selected.group ? ` · ${selected.group}` : ''}
          </span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-ink-muted" />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Choose category icon"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-hidden rounded-xl border border-border bg-canvas shadow-lg"
        >
          <div className="space-y-2 border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons, e.g. electric, car, clean…"
              aria-label="Search category icons"
              className="min-h-10 w-full rounded-lg border border-border-strong bg-surface-alt px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as CategoryIconGroup | 'All')}
              aria-label="Filter icons by industry group"
              className="min-h-10 w-full rounded-lg border border-border-strong bg-surface-alt px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            >
              <option value="All">All groups</option>
              {CATEGORY_ICON_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {sections.map((section) => (
              <div key={section.group} role="group" aria-label={section.group}>
                <p className="sticky top-0 z-[1] bg-canvas/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted backdrop-blur-sm">
                  {section.group}
                </p>
                <ul>
                  {section.icons.map((opt) => {
                    const active = opt.value === value
                    return (
                      <li key={`${section.group}-${opt.value}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onChange(opt.value)
                            setOpen(false)
                            setQuery('')
                            setGroup('All')
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition',
                            active ? 'bg-primary/10 text-primary' : 'hover:bg-surface-alt',
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-ink-primary">
                            <Icon name={opt.value} className="!text-[22px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{opt.label}</span>
                            <span className="block truncate text-xs text-ink-muted">{opt.value}</span>
                          </span>
                          {active ? <Icon name="check" className="text-primary" /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {!filtered.length ? (
              <p className="px-3 py-4 text-center text-sm text-ink-muted">No matching icons</p>
            ) : null}
          </div>
          {value && !CATEGORY_ICON_OPTIONS.some((o) => o.value === value) ? (
            <p className="border-t border-border px-3 py-2 text-[11px] text-ink-muted">
              Current custom icon “{value}” is preserved until you pick a catalogue icon.
            </p>
          ) : (
            <p className="border-t border-border px-3 py-2 text-[11px] text-ink-muted">
              {filtered.length} icons · preview matches category cards across Admin, Customer, and Technician.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
