import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync, useDebouncedValue, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, Dialog, FormError } from '@fixnow/shared'
import { categoriesApi, getFriendlyErrorMessage, mapCategory } from '@fixnow/api/admin'
import { cloudinaryPresetUrl, isCloudinaryDeliveryUrl, resolveMediaUrl } from '@fixnow/assets'
import type { ServiceCategory } from '@fixnow/types/admin'
import { LazyImage } from '@fixnow/ui'
import { CategoryIconPicker } from '../components/CategoryIconPicker'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'
import { safeArray } from '@fixnow/utils'

type StatusFilter = 'all' | 'active' | 'suspended' | 'archived'

type CategoryForm = {
  name: string
  description: string
  icon: string
  sortOrder: number
  bannerImageUrl: string
  accentColor: string
  status: ServiceCategory['status']
}

const EMPTY_FORM: CategoryForm = {
  name: '',
  description: '',
  icon: 'handyman',
  sortOrder: 0,
  bannerImageUrl: '',
  accentColor: '',
  status: 'active',
}

function toServiceCategory(raw: unknown): ServiceCategory {
  const mapped = mapCategory(raw)
  const usage = mapped.usage ?? {}
  return {
    id: mapped.id,
    name: mapped.name,
    icon: mapped.icon || 'handyman',
    description: mapped.description || '',
    activeJobs: Number(usage.jobs ?? 0),
    technicians: Number(usage.technicians ?? 0),
    growth: Number(usage.offers ?? 0),
    active: mapped.isActive,
    status: mapped.status,
    sortOrder: mapped.sortOrder,
    bannerImageUrl: mapped.bannerImageUrl,
    accentColor: mapped.accentColor,
    slug: mapped.slug,
  }
}

function statusTone(status: ServiceCategory['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'suspended') return 'warning'
  return 'neutral'
}

function isStatusFilter(v: string | null): v is StatusFilter {
  return v === 'all' || v === 'active' || v === 'suspended' || v === 'archived'
}

export function CategoriesPage() {
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<ServiceCategory | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    isStatusFilter(params.get('status')) ? (params.get('status') as StatusFilter) : 'all',
  )
  const nameId = useId()

  const { data: rows = [], status, error, reload } = useAsync(async () => {
    const res = await categoriesApi.list({
      active: 'false',
      includeUsage: 'true',
      limit: 100,
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    })
    return safeArray(res.data?.items).map(toServiceCategory)
  }, [debouncedSearch, statusFilter])

  useRealtimeReload(() => void reload(), [SOCKET_EVENTS.CATEGORY_UPDATED])

  useEffect(() => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (statusFilter !== 'all') next.set('status', statusFilter)
    setParams(next, { replace: true })
  }, [debouncedSearch, statusFilter, search, setParams])

  const ordered = useMemo(
    () => [...safeArray(rows)].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [rows],
  )

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      sortOrder: (ordered[ordered.length - 1]?.sortOrder ?? 0) + 1,
    })
    setCreating(true)
    setEditing(null)
    setActionError(null)
  }

  function openEdit(c: ServiceCategory) {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description,
      icon: c.icon,
      sortOrder: c.sortOrder,
      bannerImageUrl: c.bannerImageUrl,
      accentColor: c.accentColor,
      status: c.status,
    })
    setCreating(false)
    setActionError(null)
  }

  async function uploadBanner(file: File | null) {
    if (!file) return
    setUploading(true)
    setActionError(null)
    try {
      const res = await categoriesApi.uploadImage(file)
      const url = res.upload?.url ?? ''
      setForm((f) => ({ ...f, bannerImageUrl: url }))
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function setStatus(id: string, next: ServiceCategory['status']) {
    setSaving(true)
    setActionError(null)
    try {
      await categoriesApi.update(id, {
        status: next,
        isActive: next === 'active',
      })
      await reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeCategory(c: ServiceCategory) {
    const confirmed = window.confirm(
      c.activeJobs > 0 || c.technicians > 0
        ? `${c.name} appears to be in use. Deletion will be blocked if still referenced — continue to try soft-delete?`
        : `Soft-delete “${c.name}”? It will disappear from all apps but can remain in audit history.`,
    )
    if (!confirmed) return
    setSaving(true)
    setActionError(null)
    try {
      await categoriesApi.remove(c.id)
      await reload()
    } catch (err) {
      const message = getFriendlyErrorMessage(err)
      setActionError(
        message.includes('referenced') || message.includes('Suspend')
          ? `${message} Use Suspend to hide it from Customer and Technician apps without breaking history.`
          : message,
      )
    } finally {
      setSaving(false)
    }
  }

  async function move(c: ServiceCategory, direction: -1 | 1) {
    const idx = ordered.findIndex((row) => row.id === c.id)
    const swapWith = ordered[idx + direction]
    if (!swapWith) return
    const next = [...ordered]
    ;[next[idx], next[idx + direction]] = [next[idx + direction], next[idx]]
    setSaving(true)
    setActionError(null)
    try {
      await categoriesApi.reorder(next.map((row) => row.id))
      await reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setActionError(null)
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon.trim() || 'handyman',
        description: form.description.trim(),
        sortOrder: Number(form.sortOrder) || 0,
        bannerImageUrl: form.bannerImageUrl.trim(),
        accentColor: form.accentColor.trim(),
        status: form.status,
        isActive: form.status === 'active',
      }
      if (creating) {
        await categoriesApi.create(payload)
      } else if (editing) {
        await categoriesApi.update(editing.id, payload)
      }
      setCreating(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const dialogOpen = creating || Boolean(editing)

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/admin/dashboard" className="hover:text-primary hover:underline">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-ink-primary">Categories</li>
          {editing ? (
            <>
              <li aria-hidden="true">/</li>
              <li>{editing.name}</li>
            </>
          ) : null}
        </ol>
      </nav>

      <PageHeader
        title="Service Categories"
        subtitle="Organise marketplace services and control how they appear throughout the customer and technician applications."
        actions={
          <Button onClick={openCreate}>
            <Icon name="add" className="!text-[18px]" /> Create Category
          </Button>
        }
      />

      {actionError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {actionError}
        </FormError>
      ) : null}

      <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor={`${nameId}-search`} className="text-sm font-medium text-ink-primary">
            Search
          </label>
          <input
            id={`${nameId}-search`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, slug, or description"
            className="w-full min-h-11 rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <div className="space-y-1.5 sm:w-48">
          <label htmlFor={`${nameId}-status`} className="text-sm font-medium text-ink-primary">
            Status
          </label>
          <select
            id={`${nameId}-status`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full min-h-11 rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </Surface>

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        {ordered.length === 0 ? (
          <Surface className="flex flex-col items-center gap-3 p-12 text-center">
            <Icon name="category" className="!text-[40px] text-ink-muted" />
            <p className="text-sm font-medium text-ink-primary">No categories found</p>
            <p className="max-w-sm text-sm text-ink-muted">
              Create a service category or clear search filters to see the catalogue.
            </p>
            <Button onClick={openCreate}>Create Category</Button>
          </Surface>
        ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((c, index) => (
            <Surface key={c.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
                    style={c.accentColor ? { backgroundColor: `${c.accentColor}22`, color: c.accentColor } : undefined}
                  >
                    <Icon name={c.icon} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink-primary">{c.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{c.description}</p>
                    <p className="mt-1 text-[11px] text-ink-secondary">Order #{c.sortOrder || index + 1}</p>
                  </div>
                </div>
                <StatusBadge label={c.status} tone={statusTone(c.status)} />
              </div>

              {c.bannerImageUrl ? (
                <LazyImage
                  src={
                    isCloudinaryDeliveryUrl(resolveMediaUrl(c.bannerImageUrl, 'categories.electrical'))
                      ? cloudinaryPresetUrl(
                          resolveMediaUrl(c.bannerImageUrl, 'categories.electrical'),
                          'thumbnail',
                        ) || resolveMediaUrl(c.bannerImageUrl, 'categories.electrical')
                      : resolveMediaUrl(c.bannerImageUrl, 'categories.electrical')
                  }
                  fallback={resolveMediaUrl(null, 'categories.electrical')}
                  alt={`${c.name} category banner`}
                  className="h-24 w-full rounded-lg object-cover bg-surface"
                  emptyContent={
                    <span className="flex h-24 w-full items-center justify-center rounded-lg bg-surface-alt text-ink-muted">
                      <Icon name="image" />
                    </span>
                  }
                />
              ) : null}

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg border border-border bg-surface p-2">
                  <p className="text-xs text-ink-secondary">Jobs</p>
                  <p className="font-semibold tabular-nums">{c.activeJobs}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-2">
                  <p className="text-xs text-ink-secondary">Techs</p>
                  <p className="font-semibold tabular-nums">{c.technicians}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-2">
                  <p className="text-xs text-ink-secondary">Offers</p>
                  <p className="font-semibold tabular-nums">{c.growth}</p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" disabled={saving || index === 0} onClick={() => void move(c, -1)}>
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving || index === ordered.length - 1}
                  onClick={() => void move(c, 1)}
                >
                  ↓
                </Button>
                {c.status === 'active' ? (
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => void setStatus(c.id, 'suspended')}>
                    Suspend
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void setStatus(c.id, 'active')}
                  >
                    Activate
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void removeCategory(c)}>
                  Delete
                </Button>
              </div>
            </Surface>
          ))}
        </div>
        )}
      </AsyncStateView>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        title={creating ? 'Create Category' : 'Edit Category'}
        panelClassName="max-w-lg"
      >
        <div className="space-y-4">
          <Field
            id={`${nameId}-name`}
            label="Name"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <CategoryIconPicker
            id={`${nameId}-icon`}
            value={form.icon}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
          />
          <Field
            id={`${nameId}-desc`}
            label="Description"
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
          />
          <Field
            id={`${nameId}-order`}
            label="Display order"
            value={String(form.sortOrder)}
            onChange={(v) => setForm((f) => ({ ...f, sortOrder: Number(v) || 0 }))}
          />
          <Field
            id={`${nameId}-color`}
            label="Accent colour (optional)"
            value={form.accentColor}
            onChange={(v) => setForm((f) => ({ ...f, accentColor: v }))}
          />
          <div className="space-y-1.5">
            <label htmlFor={`${nameId}-status-form`} className="text-sm font-medium text-ink-primary">
              Status
            </label>
            <select
              id={`${nameId}-status-form`}
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as ServiceCategory['status'] }))
              }
              className="w-full min-h-11 rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${nameId}-banner`} className="text-sm font-medium text-ink-primary">
              Banner image
            </label>
            <p className="text-xs text-ink-secondary">
              Categories keep both an icon and an optional photo. Image is shown when present; otherwise the
              icon is used.
            </p>
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface-alt/60 p-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-label={`Icon preview: ${form.icon || 'handyman'}`}
              >
                <Icon name={form.icon || 'handyman'} />
              </div>
              <div className="min-w-0 text-xs text-ink-secondary">
                <div className="font-medium text-ink-primary">Icon preview</div>
                <div className="truncate">{form.icon || 'handyman'}</div>
              </div>
            </div>
            {form.bannerImageUrl ? (
              <LazyImage
                src={resolveMediaUrl(form.bannerImageUrl, 'categories.electrical')}
                fallback={resolveMediaUrl(null, 'categories.electrical')}
                alt={form.name ? `${form.name} category banner preview` : 'Category banner preview'}
                className="mb-2 h-28 w-full rounded-lg object-cover"
              />
            ) : null}
            <p className="text-xs text-ink-secondary">Upload a category photo (optional). Do not paste URLs.</p>
            <input
              id={`${nameId}-banner`}
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => void uploadBanner(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-secondary"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={!form.bannerImageUrl}
                onClick={() => setForm((f) => ({ ...f, bannerImageUrl: '' }))}
              >
                Remove image
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, icon: 'handyman' }))}
              >
                Restore default icon
              </Button>
            </div>
          </div>
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border/60 bg-canvas pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || uploading} aria-busy={saving}>
              {creating ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="block space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-primary">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-11 rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
      />
    </div>
  )
}
