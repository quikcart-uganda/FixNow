import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, FormError, AppErrorBoundary } from '@fixnow/shared'
import {
  contentApi,
  getFriendlyErrorMessage,
  type PublicContentPage,
} from '@fixnow/api/admin'
import { resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'
import { Button, Icon, OverflowMenu, PageHeader, StatusBadge, Surface } from '../components/ui'
import { ContentIconPicker } from '../components/cms/ContentIconPicker'
import { LivePreview, type PreviewMode } from '../components/cms/LivePreview'
import { MediaLibrary, type MediaAsset } from '../components/cms/MediaLibrary'
import {
  WORKSPACES,
  audienceLabel,
  categoryLabel,
  formatEdited,
  statusLabel,
  type WorkspaceId,
} from '../components/cms/labels'

const CATEGORIES = ['legal', 'support', 'public', 'authentication', 'account', 'system'] as const
const STATUSES = ['draft', 'published', 'scheduled', 'archived'] as const

type EditorState = {
  id?: string
  title: string
  slug: string
  category: string
  audience: string
  language: string
  bodyMarkdown: string
  excerpt: string
  seoTitle: string
  seoDescription: string
  keywords: string
  scheduledPublishAt: string
  status: string
  heroImageUrl: string
  icon: string
  ctaLabel: string
  ctaHref: string
  displayLocation: string
}

const emptyEditor = (): EditorState => ({
  title: '',
  slug: '',
  category: 'support',
  audience: 'all',
  language: 'en',
  bodyMarkdown: '',
  excerpt: '',
  seoTitle: '',
  seoDescription: '',
  keywords: '',
  scheduledPublishAt: '',
  status: 'draft',
  heroImageUrl: '',
  icon: 'article',
  ctaLabel: '',
  ctaHref: '',
  displayLocation: 'help',
})

function toneForStatus(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'published') return 'success'
  if (status === 'scheduled') return 'warning'
  if (status === 'archived') return 'danger'
  return 'neutral'
}

const MARKETING_LINKS = [
  {
    to: '/admin/marketing/platform',
    title: 'Platform promotions',
    hint: 'Holiday, welcome and referral campaigns owned by FixNow.',
    icon: 'campaign',
  },
  {
    to: '/admin/marketing/campaigns',
    title: 'Sponsored campaigns',
    hint: 'Educational banners, safety tips and partner stories.',
    icon: 'featured_seasonal_and_gifts',
  },
  {
    to: '/admin/marketing/ads',
    title: 'Advertisements',
    hint: 'Partner ads shown in customer placements.',
    icon: 'ad_units',
  },
  {
    to: '/admin/marketing/content-blocks',
    title: 'Dynamic homepage sections',
    hint: 'Hero copy, promo banners and app-specific blocks.',
    icon: 'view_quilt',
  },
  {
    to: '/admin/marketing/pending',
    title: 'Technician offers',
    hint: 'Moderate technician-generated promotions before customers see them.',
    icon: 'local_offer',
  },
]

function MediaSessionKey() {
  return 'fixnow.cms.media.v1'
}

function loadSessionMedia(): MediaAsset[] {
  try {
    const raw = sessionStorage.getItem(MediaSessionKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as MediaAsset[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function ContentPage() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('knowledge')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [previewPage, setPreviewPage] = useState<PublicContentPage | null>(null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [editorPane, setEditorPane] = useState<'form' | 'preview'>('form')
  const [versionsFor, setVersionsFor] = useState<PublicContentPage | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => loadSessionMedia())
  const [showMediaInEditor, setShowMediaInEditor] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(MediaSessionKey(), JSON.stringify(mediaAssets.slice(0, 80)))
    } catch {
      /* ignore quota */
    }
  }, [mediaAssets])

  const activeWorkspace = WORKSPACES.find((w) => w.id === workspace) || WORKSPACES[0]

  const listQuery = useAsync(async () => {
    const res = await contentApi.listAdmin({
      q: q || undefined,
      status: status || undefined,
      limit: 100,
    })
    return safeArray<PublicContentPage>(res.data?.items)
  }, [q, status])

  useRealtimeReload(() => void listQuery.reload(), [SOCKET_EVENTS.CONTENT_UPDATED])

  const allRows = safeArray<PublicContentPage>(listQuery.data)

  // Seed media library from existing hero images (no new backend required).
  useEffect(() => {
    if (!allRows.length) return
    setMediaAssets((prev) => {
      const existing = new Set(prev.map((p) => p.url))
      const fromContent: MediaAsset[] = []
      for (const row of allRows) {
        if (row.heroImageUrl && !existing.has(row.heroImageUrl)) {
          fromContent.push({
            id: `hero-${row.id}`,
            url: row.heroImageUrl,
            name: row.title,
            folder: row.category === 'legal' ? 'Legal' : 'Articles',
            alt: row.title,
            uploadedAt: row.updatedAt || row.createdAt || new Date().toISOString(),
          })
          existing.add(row.heroImageUrl)
        }
      }
      return fromContent.length ? [...fromContent, ...prev] : prev
    })
  }, [allRows])

  const rows = useMemo(() => {
    if (workspace === 'marketing' || workspace === 'media') return []
    const ws = activeWorkspace
    return allRows.filter((row) => {
      const catOk =
        !('categories' in ws) ||
        !ws.categories.length ||
        (ws.categories as readonly string[]).includes(row.category)
      const audOk =
        !('audience' in ws) ||
        !ws.audience ||
        row.audience === 'all' ||
        row.audience === ws.audience
      return catOk && audOk
    })
  }, [activeWorkspace, allRows, workspace])

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setActionError(null)
    try {
      await action()
      await listQuery.reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function openCreate() {
    const defaults = emptyEditor()
    if (workspace === 'legal') defaults.category = 'legal'
    if (workspace === 'customer') {
      defaults.audience = 'customer'
      defaults.category = 'public'
    }
    if (workspace === 'technician') {
      defaults.audience = 'technician'
      defaults.category = 'support'
    }
    setEditor(defaults)
    setPreviewPage(null)
    setShowMediaInEditor(false)
    setEditorPane('form')
  }

  function openEdit(row: PublicContentPage) {
    const keywords = Array.isArray(row.keywords)
      ? row.keywords.join(', ')
      : typeof row.keywords === 'string'
        ? row.keywords
        : ''
    setEditor({
      id: row.id,
      title: row.title || '',
      slug: row.slug || '',
      category: row.category || 'support',
      audience: row.audience || 'all',
      language: row.language || 'en',
      bodyMarkdown: row.bodyMarkdown || '',
      excerpt: row.excerpt || '',
      seoTitle: row.seoTitle || '',
      seoDescription: row.seoDescription || '',
      keywords,
      scheduledPublishAt: row.scheduledPublishAt ? String(row.scheduledPublishAt).slice(0, 16) : '',
      status: row.status || 'draft',
      heroImageUrl: row.heroImageUrl || '',
      icon: 'article',
      ctaLabel: '',
      ctaHref: '',
      displayLocation: 'help',
    })
    setPreviewPage(null)
    setShowMediaInEditor(false)
    setEditorPane('form')
  }

  async function saveEditor(andPublish = false) {
    if (!editor?.title.trim()) return
    await run(async () => {
      const body = {
        title: editor.title.trim(),
        slug: editor.slug.trim() || undefined,
        category: editor.category,
        audience: editor.audience,
        language: editor.language,
        bodyMarkdown: editor.bodyMarkdown,
        excerpt: editor.excerpt,
        seoTitle: editor.seoTitle,
        seoDescription: editor.seoDescription,
        heroImageUrl: editor.heroImageUrl || undefined,
        keywords: editor.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        scheduledPublishAt: editor.scheduledPublishAt
          ? new Date(editor.scheduledPublishAt).toISOString()
          : null,
        // Edits always persist as draft; Publish action calls contentApi.publish.
        status: 'draft',
      }
      let id = editor.id
      if (editor.id) {
        await contentApi.update(editor.id, body)
      } else {
        const created = await contentApi.create({ ...body, title: body.title })
        const page = (created.data as { page?: PublicContentPage } | undefined)?.page
        id = page?.id
      }
      if (andPublish && id) {
        await contentApi.publish(id)
      }
      setEditor(null)
    })
  }

  function articleActions(row: PublicContentPage) {
    return [
      {
        key: 'primary',
        actions: [
          { key: 'open', label: 'Open', icon: 'open_in_new', onSelect: () => setPreviewPage(row) },
          { key: 'edit', label: 'Edit', icon: 'edit', onSelect: () => openEdit(row) },
          { key: 'preview', label: 'Preview', icon: 'visibility', onSelect: () => setPreviewPage(row) },
          {
            key: 'publish',
            label: row.status === 'published' ? 'Unpublish' : 'Publish',
            icon: row.status === 'published' ? 'unpublished' : 'publish',
            onSelect: () =>
              void run(async () => {
                if (row.status === 'published') await contentApi.unpublish(row.id)
                else await contentApi.publish(row.id)
              }),
          },
        ],
      },
      {
        key: 'manage',
        label: 'Manage',
        actions: [
          {
            key: 'duplicate',
            label: 'Duplicate',
            icon: 'content_copy',
            onSelect: () => void run(async () => { await contentApi.duplicate(row.id) }),
          },
          {
            key: 'archive',
            label: 'Archive',
            icon: 'archive',
            onSelect: () => void run(async () => { await contentApi.archive(row.id) }),
          },
          {
            key: 'restore',
            label: 'Restore',
            icon: 'restore',
            onSelect: () => void run(async () => { await contentApi.restore(row.id) }),
          },
          {
            key: 'versions',
            label: 'Version history',
            icon: 'history',
            onSelect: () => setVersionsFor(row),
          },
          {
            key: 'move',
            label: 'Move to Knowledge Base',
            icon: 'drive_file_move',
            disabled: row.category === 'support',
            onSelect: () =>
              void run(async () => {
                await contentApi.update(row.id, { category: 'support' })
              }),
          },
        ],
      },
      {
        key: 'danger',
        actions: [
          {
            key: 'delete',
            label: 'Delete',
            icon: 'delete',
            tone: 'danger' as const,
            onSelect: () => {
              if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return
              void run(async () => { await contentApi.remove(row.id) })
            },
          },
        ],
      },
    ]
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Content Management"
        subtitle="Create and publish customer, technician, marketing, knowledge base and legal content from one professional CMS."
        actions={
          <div className="flex flex-wrap gap-2">
            {workspace !== 'marketing' && workspace !== 'media' ? (
              <Button onClick={openCreate}>
                <Icon name="add" className="!text-[18px]" /> New article
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  await contentApi.seed()
                })
              }
            >
              <Icon name="auto_awesome" className="!text-[18px]" /> Restore defaults
            </Button>
          </div>
        }
      />

      {actionError ? (
        <FormError className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {actionError}
        </FormError>
      ) : null}

      {/* Workspace separation */}
      <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => setWorkspace(ws.id)}
            className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition touch-manipulation ${
              workspace === ws.id
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-canvas text-ink-secondary hover:border-primary/40'
            }`}
          >
            {ws.label}
          </button>
        ))}
      </div>

      <Surface className="p-5">
        <h2 className="text-lg font-semibold text-ink-primary">{activeWorkspace.label}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">{activeWorkspace.description}</p>
        {(workspace === 'customer' || workspace === 'technician') && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/admin/marketing/content-blocks"
              className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-alt"
            >
              Dynamic app sections
            </Link>
            <Link
              to="/admin/notifications"
              className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-alt"
            >
              Notification templates
            </Link>
          </div>
        )}
      </Surface>

      {workspace === 'marketing' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MARKETING_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-2xl border border-border bg-canvas p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={item.icon} />
              </span>
              <p className="mt-3 font-semibold text-ink-primary">{item.title}</p>
              <p className="mt-1 text-sm text-ink-secondary">{item.hint}</p>
              <p className="mt-3 text-xs font-semibold text-primary">Open workspace →</p>
            </Link>
          ))}
        </div>
      ) : null}

      {workspace === 'media' ? (
        <Surface className="p-5">
          <MediaLibrary assets={mediaAssets} onAssetsChange={setMediaAssets} />
        </Surface>
      ) : null}

      {workspace !== 'marketing' && workspace !== 'media' ? (
        <>
          <Surface className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_auto]">
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="font-semibold text-ink-secondary">Search articles</span>
              <input
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title or keywords…"
                aria-label="Search articles"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-ink-secondary">Status</span>
              <select
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <p className="pb-2 text-sm tabular-nums text-ink-muted">{rows.length} articles</p>
            </div>
          </Surface>

          <AsyncStateView
            status={listQuery.status}
            error={listQuery.error}
            onRetry={() => void listQuery.reload()}
            emptyTitle="No articles in this workspace"
            emptyHint="Create an article or restore default pages to populate this section."
            emptyIcon="article"
            emptyActionLabel="New article"
            onEmptyAction={openCreate}
          >
            {rows.length === 0 ? (
              <Surface className="flex flex-col items-center gap-3 p-12 text-center">
                <Icon name="article" className="!text-[40px] text-ink-muted" />
                <p className="text-sm font-semibold text-ink-primary">No articles in this workspace</p>
                <p className="max-w-md text-sm text-ink-muted">
                  Create an article or restore default pages to populate this section.
                </p>
                <Button onClick={openCreate}>New article</Button>
              </Surface>
            ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-sm"
                >
                  <button type="button" className="text-left" onClick={() => setPreviewPage(row)}>
                    <div className="aspect-[16/9] bg-surface-alt">
                      {row.heroImageUrl ? (
                        <LazyImage
                          src={resolveMediaUrl(row.heroImageUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                          emptyContent={
                            <span className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-alt text-primary">
                              <Icon name="article" className="!text-[40px]" />
                            </span>
                          }
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-alt text-primary">
                          <Icon name="article" className="!text-[40px]" />
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-ink-primary line-clamp-2">{row.title}</h3>
                      <OverflowMenu sections={articleActions(row)} label={`Actions for ${row.title}`} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge label={statusLabel(row.status)} tone={toneForStatus(row.status)} />
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                        {categoryLabel(row.category)}
                      </span>
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                        {audienceLabel(row.audience)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-ink-secondary">
                      {row.excerpt || 'No summary yet.'}
                    </p>
                    <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-ink-muted">
                      <div>
                        <dt>Last edited</dt>
                        <dd className="font-medium text-ink-secondary">{formatEdited(row.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>Published</dt>
                        <dd className="font-medium text-ink-secondary">
                          {row.publishedAt ? formatEdited(row.publishedAt) : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Author</dt>
                        <dd className="font-medium text-ink-secondary">
                          {row.updatedBy || row.createdBy ? 'Administrator' : 'System'}
                        </dd>
                      </div>
                      <div>
                        <dt>Revision</dt>
                        <dd className="font-medium tabular-nums text-ink-secondary">Rev {row.version}</dd>
                      </div>
                    </dl>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPreviewPage(row)}>
                        Preview
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            )}
          </AsyncStateView>
        </>
      ) : null}

      {/* Professional editor — full-screen on mobile, split on desktop */}
      {editor ? (
        <AppErrorBoundary
          compact
          title="Unable to load article"
          onReset={() => setEditor(null)}
        >
        <div
          className="fixed inset-0 z-50 flex bg-canvas sm:bg-black/40 sm:p-3 md:p-4"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          role="dialog"
          aria-modal="true"
          aria-label={editor.id ? 'Edit article' : 'Create article'}
        >
          <Surface className="mx-auto flex h-[100dvh] w-full max-w-7xl min-w-0 flex-col overflow-hidden rounded-none border-0 sm:h-auto sm:max-h-[min(96dvh,920px)] sm:rounded-2xl sm:border">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-ink-primary sm:text-lg">
                  {editor.id ? 'Edit article' : 'Create article'}
                </h2>
                <p className="hidden text-xs text-ink-muted sm:block">
                  Changes save to the content library — apps update after publish.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-10 touch-manipulation" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="min-h-10 touch-manipulation"
                  disabled={saving || !editor.title.trim()}
                  onClick={() => void saveEditor(false)}
                >
                  Save draft
                </Button>
                <Button
                  className="min-h-10 touch-manipulation"
                  disabled={saving || !editor.title.trim()}
                  onClick={() => void saveEditor(true)}
                >
                  Publish
                </Button>
              </div>
            </div>

            {/* Mobile: Form | Preview tabs */}
            <div className="flex shrink-0 gap-2 border-b border-border px-3 py-2 lg:hidden">
              <button
                type="button"
                onClick={() => setEditorPane('form')}
                className={`min-h-10 flex-1 rounded-lg text-sm font-semibold touch-manipulation ${
                  editorPane === 'form' ? 'bg-primary text-white' : 'bg-surface-alt text-ink-secondary'
                }`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setEditorPane('preview')}
                className={`min-h-10 flex-1 rounded-lg text-sm font-semibold touch-manipulation ${
                  editorPane === 'preview' ? 'bg-primary text-white' : 'bg-surface-alt text-ink-secondary'
                }`}
              >
                Preview
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-2">
              <div
                className={`min-h-0 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-6 ${
                  editorPane === 'form' ? 'block' : 'hidden lg:block'
                }`}
              >
                <Field
                  label="Title"
                  value={editor.title}
                  onChange={(v) => setEditor({ ...editor, title: v })}
                />
                <Field
                  label="Web address (optional)"
                  value={editor.slug}
                  onChange={(v) => setEditor({ ...editor, slug: v })}
                  placeholder="Generated automatically from the title"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Category</span>
                    <select
                      className="min-h-11 rounded-lg border border-border px-3 py-2"
                      value={editor.category}
                      onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Audience</span>
                    <select
                      className="min-h-11 rounded-lg border border-border px-3 py-2"
                      value={editor.audience}
                      onChange={(e) => setEditor({ ...editor, audience: e.target.value })}
                    >
                      <option value="all">{audienceLabel('all')}</option>
                      <option value="customer">{audienceLabel('customer')}</option>
                      <option value="technician">{audienceLabel('technician')}</option>
                      <option value="admin">{audienceLabel('admin')}</option>
                    </select>
                  </label>
                </div>
                <Field
                  label="Tags"
                  value={editor.keywords}
                  onChange={(v) => setEditor({ ...editor, keywords: v })}
                  placeholder="Comma-separated topics"
                />
                <Field
                  label="Summary"
                  value={editor.excerpt}
                  onChange={(v) => setEditor({ ...editor, excerpt: v })}
                />
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Content</span>
                  <textarea
                    className="min-h-40 rounded-lg border border-border px-3 py-2 text-base leading-relaxed sm:min-h-48 sm:text-sm"
                    value={editor.bodyMarkdown}
                    onChange={(e) => setEditor({ ...editor, bodyMarkdown: e.target.value })}
                    placeholder="Write your article… Use headings, lists and links."
                  />
                </label>

                <div className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Featured image</p>
                    <Button size="sm" variant="outline" className="touch-manipulation" onClick={() => setShowMediaInEditor((v) => !v)}>
                      {showMediaInEditor ? 'Hide library' : 'Media library'}
                    </Button>
                  </div>
                  {editor.heroImageUrl ? (
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
                      <LazyImage
                        src={resolveMediaUrl(editor.heroImageUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute right-2 top-2 touch-manipulation"
                        onClick={() => setEditor({ ...editor, heroImageUrl: '' })}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">No image selected — upload or pick from the library.</p>
                  )}
                  {showMediaInEditor ? (
                    <MediaLibrary
                      compact
                      assets={mediaAssets}
                      onAssetsChange={setMediaAssets}
                      selectedUrl={editor.heroImageUrl}
                      onSelect={(asset) => setEditor({ ...editor, heroImageUrl: asset.url })}
                    />
                  ) : null}
                </div>

                <ContentIconPicker
                  value={editor.icon}
                  onChange={(icon) => setEditor({ ...editor, icon })}
                  label="Icon"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Button label"
                    value={editor.ctaLabel}
                    onChange={(v) => setEditor({ ...editor, ctaLabel: v })}
                    placeholder="e.g. Learn more"
                  />
                  <Field
                    label="Button destination"
                    value={editor.ctaHref}
                    onChange={(v) => setEditor({ ...editor, ctaHref: v })}
                    placeholder="e.g. /customer/help"
                  />
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Display location</span>
                    <select
                      className="min-h-11 rounded-lg border border-border px-3 py-2"
                      value={editor.displayLocation}
                      onChange={(e) => setEditor({ ...editor, displayLocation: e.target.value })}
                    >
                      <option value="help">Help centre</option>
                      <option value="home">Home</option>
                      <option value="onboarding">Onboarding</option>
                      <option value="legal">Legal centre</option>
                      <option value="auth">Sign-in screens</option>
                    </select>
                  </label>
                  <Field
                    label="Publish date"
                    value={editor.scheduledPublishAt}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        scheduledPublishAt: v,
                        status: v ? 'scheduled' : editor.status,
                      })
                    }
                    type="datetime-local"
                  />
                </div>
                <Field
                  label="Search title (optional)"
                  value={editor.seoTitle}
                  onChange={(v) => setEditor({ ...editor, seoTitle: v })}
                />
                <Field
                  label="Search description (optional)"
                  value={editor.seoDescription}
                  onChange={(v) => setEditor({ ...editor, seoDescription: v })}
                />
              </div>

              <div
                className={`min-h-0 border-border bg-surface-alt/30 p-3 sm:p-6 lg:border-l ${
                  editorPane === 'preview' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                }`}
              >
                <p className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Live preview
                </p>
                <div className="min-h-0 flex-1">
                  <LivePreview
                    mode={previewMode}
                    onModeChange={setPreviewMode}
                    model={{
                      title: editor.title,
                      excerpt: editor.excerpt,
                      bodyMarkdown: editor.bodyMarkdown,
                      heroImageUrl: editor.heroImageUrl,
                      audience: editor.audience,
                      ctaLabel: editor.ctaLabel,
                      icon: editor.icon,
                      status: editor.status,
                    }}
                  />
                </div>
              </div>
            </div>
          </Surface>
        </div>
        </AppErrorBoundary>
      ) : null}

      {previewPage ? (
        <AppErrorBoundary
          compact
          title="Unable to load article"
          onReset={() => setPreviewPage(null)}
        >
        <div
          className="fixed inset-0 z-50 flex bg-canvas sm:bg-black/40 sm:p-3 md:p-4"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewPage.title || 'article'}`}
        >
          <Surface className="mx-auto flex h-[100dvh] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-none border-0 sm:h-auto sm:max-h-[min(96dvh,920px)] sm:rounded-2xl sm:border">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-ink-primary">{previewPage.title}</h2>
                <p className="truncate text-xs text-ink-muted">
                  {categoryLabel(previewPage.category)} · {audienceLabel(previewPage.audience)} ·{' '}
                  {statusLabel(previewPage.status)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" className="min-h-10 touch-manipulation" onClick={() => openEdit(previewPage)}>
                  Edit
                </Button>
                <button
                  type="button"
                  onClick={() => setPreviewPage(null)}
                  className="min-h-10 min-w-10 rounded-full p-2 touch-manipulation hover:bg-surface-alt"
                  aria-label="Close preview"
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
              <LivePreview
                mode={previewMode}
                onModeChange={setPreviewMode}
                model={{
                  title: previewPage.title,
                  excerpt: previewPage.excerpt,
                  bodyHtml: previewPage.bodyHtml,
                  bodyMarkdown: previewPage.bodyMarkdown,
                  heroImageUrl: previewPage.heroImageUrl,
                  audience: previewPage.audience,
                }}
              />
            </div>
          </Surface>
        </div>
        </AppErrorBoundary>
      ) : null}

      {versionsFor ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Surface className="max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl p-5 sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Version history</h2>
              <button
                type="button"
                onClick={() => setVersionsFor(null)}
                className="min-h-10 min-w-10 rounded-full p-2 touch-manipulation hover:bg-surface-alt"
                aria-label="Close version history"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="mt-1 truncate text-sm text-ink-muted">{versionsFor.title}</p>
            {versionsFor.revisionHistory?.length ? (
              <ol className="mt-4 space-y-2">
                {versionsFor.revisionHistory
                  .slice()
                  .reverse()
                  .map((r) => (
                    <li key={`${r.version}-${r.snapshotAt}`} className="rounded-xl border border-border px-3 py-2 text-sm">
                      <p className="font-semibold">Revision {r.version}</p>
                      <p className="text-xs text-ink-muted">
                        {statusLabel(r.status)} · {formatEdited(r.snapshotAt)}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 min-h-10 touch-manipulation"
                        disabled={saving}
                        onClick={() =>
                          void run(async () => {
                            await contentApi.restore(versionsFor.id, r.version)
                            setVersionsFor(null)
                          })
                        }
                      >
                        Restore this revision
                      </Button>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-ink-muted">No prior revisions recorded yet.</p>
            )}
          </Surface>
        </div>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      <input
        type={type}
        className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-base sm:text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
