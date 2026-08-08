import { useMemo, useRef, useState } from 'react'
import {
  getFriendlyErrorMessage,
  portfolioApi,
  type CaseStudyItem,
  type CertificateItem,
  type PortfolioMediaItem,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, Dialog } from '@fixnow/shared'
import { resolveMediaUrl, cloudinaryPresetUrl, isCloudinaryDeliveryUrl, assetUrl } from '@fixnow/assets'
import { Badge, Button, Card, Field, Icon, Pill, TextArea } from '@fixnow/ui'
import { LazyImage } from '@fixnow/native'
import { cn, safeArray } from '@fixnow/utils'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { planEmptyCopy } from '@technician/lib/planWorkspace'

type Filter = 'all' | 'photo' | 'video' | 'certificate' | 'case-study' | 'licence'

async function uploadFiles(files: FileList | File[]) {
  const list = Array.from(files)
  const urls: string[] = []
  for (const file of list) {
    const res = await portfolioApi.upload(file, 'portfolio')
    urls.push(res.upload.url)
  }
  return urls
}

export function PortfolioPage() {
  const { profile } = useApp()
  const tier = usePlanWorkspaceTier()
  const emptyCopy = planEmptyCopy(tier, 'portfolio')
  const [filter, setFilter] = useState<Filter>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    kind: 'photo' as string,
    title: '',
    description: '',
    tags: '',
    district: profile.district || '',
    visibility: 'public',
    customerPermission: false,
    featured: false,
    url: '',
    galleryUrls: [] as string[],
    videoUrl: '',
    beforeAfter: 'none',
    issuer: '',
    challenge: '',
    solution: '',
    outcome: '',
  })

  const feed = useAsync(async () => (await portfolioApi.feedMine()).data, [], {
    cacheKey: 'technician.portfolio.v1',
  })

  const media = safeArray<PortfolioMediaItem>(feed.data?.media)
  const caseStudies = safeArray<CaseStudyItem>(feed.data?.caseStudies)
  const certificates = safeArray<CertificateItem>(feed.data?.certificates)
  const counts = feed.data?.counts

  const filteredMedia = useMemo(() => {
    if (filter === 'all') return media
    if (filter === 'case-study') return []
    if (filter === 'certificate' || filter === 'licence') {
      return media.filter((m) => m.kind === filter)
    }
    if (filter === 'photo') return media.filter((m) => m.kind === 'photo' || m.kind === 'before_after')
    return media.filter((m) => m.kind === filter)
  }, [filter, media])

  const showCaseStudies = filter === 'all' || filter === 'case-study'
  const showCertificates =
    filter === 'all' || filter === 'certificate' || filter === 'licence'

  const resetForm = () => {
    setForm({
      kind: 'photo',
      title: '',
      description: '',
      tags: '',
      district: profile.district || '',
      visibility: 'public',
      customerPermission: false,
      featured: false,
      url: '',
      galleryUrls: [],
      videoUrl: '',
      beforeAfter: 'none',
      issuer: '',
      challenge: '',
      solution: '',
      outcome: '',
    })
  }

  const onPickFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    setBusy(true)
    setError(null)
    try {
      const urls = await uploadFiles(files)
      setForm((f) => ({
        ...f,
        url: f.url || urls[0] || '',
        galleryUrls: [...f.galleryUrls, ...urls.slice(f.url ? 0 : 1)],
        videoUrl: f.kind === 'video' ? urls[0] || f.videoUrl : f.videoUrl,
      }))
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (form.kind === 'case_study') {
        await portfolioApi.createCaseStudy({
          title: form.title,
          challenge: form.challenge || form.description,
          solution: form.solution || form.description,
          outcome: form.outcome,
          coverImageUrl: form.url,
          tags,
          district: form.district,
          visibility: form.visibility,
          featured: form.featured,
          customerPermission: form.customerPermission,
          isPublished: true,
          completionDate: new Date().toISOString(),
        })
      } else if (form.kind === 'certificate' || form.kind === 'licence') {
        await portfolioApi.createCertificate({
          title: form.title,
          issuer: form.issuer,
          kind: form.kind,
          documentUrl: form.url,
          thumbnailUrl: form.url,
          description: form.description,
          visibility: form.visibility,
          featured: form.featured,
        })
      } else {
        await portfolioApi.createMedia({
          kind: form.kind,
          title: form.title,
          description: form.description,
          url: form.url,
          galleryUrls: form.galleryUrls,
          videoUrl: form.videoUrl || undefined,
          tags,
          district: form.district,
          visibility: form.visibility,
          featured: form.featured,
          customerPermission: form.customerPermission,
          beforeAfter: form.beforeAfter,
          completionDate: new Date().toISOString(),
        })
      }
      resetForm()
      setComposerOpen(false)
      await feed.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const empty =
    !media.length && !caseStudies.length && !certificates.length && feed.status !== 'loading'

  return (
    <PlanWorkspaceShell page="portfolio">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl bg-surface-container',
          tier === 'professional' && 'ring-1 ring-primary/20',
          tier === 'business' && 'ring-1 ring-teal-800/25',
        )}
      >
        <LazyImage
          alt=""
          src={
            isCloudinaryDeliveryUrl(assetUrl('technicians.portfolio'))
              ? cloudinaryPresetUrl(assetUrl('technicians.portfolio'), 'banner') ||
                assetUrl('technicians.portfolio')
              : assetUrl('technicians.portfolio')
          }
          className="h-36 w-full object-cover sm:h-44"
          sizes="100vw"
          emptyContent={<span className="block h-36 w-full bg-surface-container sm:h-44" />}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="text-caps text-white/80">
            {tier === 'business'
              ? 'Company brand gallery'
              : tier === 'professional'
                ? 'Professional proof studio'
                : 'Build trust with proof'}
          </p>
          <p className="text-title-md font-bold text-white">
            {tier === 'business'
              ? 'Case studies and certificates that sell the company'
              : 'Show customers your completed work'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {counts ? (
            <p className="text-label text-on-surface-variant">
              {counts.media} media · {counts.caseStudies} case studies · {counts.certificates} certificates
              {counts.featured ? ` · ${counts.featured} featured` : ''}
            </p>
          ) : null}
          {tier === 'professional' || tier === 'business' ? (
            <p className="mt-1 text-label text-on-surface-variant">
              {tier === 'business'
                ? 'Feature certificates and licences for executive trust.'
                : 'Feature before/after photos and video for stronger conversion.'}
            </p>
          ) : null}
        </div>
        <Button className="min-h-11 fn-pressable" onClick={() => setComposerOpen(true)}>
          <Icon name="upload" />
          Upload work
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['case-study', 'Case studies'],
            ['photo', 'Photos'],
            ['video', 'Videos'],
            ['certificate', 'Certificates'],
            ['licence', 'Licences'],
          ] as const
        ).map(([id, label]) => (
          <Pill key={id} active={filter === id} onClick={() => setFilter(id)}>
            {label}
          </Pill>
        ))}
      </div>

      <AsyncStateView
        status={feed.status === 'error' ? 'error' : empty ? 'empty' : 'success'}
        error={feed.error}
        onRetry={() => void feed.reload()}
        emptyTitle={emptyCopy.title}
        emptyHint={emptyCopy.hint}
        emptyActionLabel="Upload work"
        onEmptyAction={() => setComposerOpen(true)}
      >
        <div className="space-y-8">
          {showCaseStudies && caseStudies.length ? (
            <section className="space-y-3">
              <h2 className="text-title">Case studies</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {caseStudies.map((cs) => (
                  <Card key={cs.id} className="overflow-hidden">
                    {cs.coverImageUrl ? (
                      <LazyImage
                        src={resolveMediaUrl(cs.coverImageUrl)}
                        alt=""
                        className="aspect-[16/9] w-full object-cover"
                      />
                    ) : null}
                    <div className="space-y-2 p-4">
                      <div className="flex flex-wrap gap-2">
                        {cs.featured ? <Badge tone="primary">Featured</Badge> : null}
                        <Badge>{cs.visibility}</Badge>
                      </div>
                      <h3 className="text-title">{cs.title}</h3>
                      <p className="line-clamp-3 text-label text-on-surface-variant">{cs.challenge}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => void portfolioApi.removeCaseStudy(cs.id).then(() => feed.reload())}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {filteredMedia.length ? (
            <section className="space-y-3">
              <h2 className="text-title">Gallery</h2>
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                {filteredMedia.map((item) => (
                  <Card key={item.id} className="mb-4 break-inside-avoid overflow-hidden">
                    <LazyImage
                      src={resolveMediaUrl(item.thumbnailUrl || item.url)}
                      alt={item.title || ''}
                      className="w-full object-cover"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                    <div className="space-y-2 p-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge>{item.kind.replace(/_/g, ' ')}</Badge>
                        {item.featured ? <Badge tone="primary">Featured</Badge> : null}
                        {item.status !== 'active' ? <Badge tone="warning">{item.status}</Badge> : null}
                      </div>
                      <p className="text-label font-bold">{item.title || item.caption || 'Untitled'}</p>
                      {item.description ? (
                        <p className="line-clamp-2 text-caps text-on-surface-variant">{item.description}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void portfolioApi.featureMedia(item.id).then(() => feed.reload())}
                        >
                          Feature
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void (item.status === 'archived'
                              ? portfolioApi.restoreMedia(item.id)
                              : portfolioApi.archiveMedia(item.id)
                            ).then(() => feed.reload())
                          }
                        >
                          {item.status === 'archived' ? 'Restore' : 'Archive'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!window.confirm('Delete this item?')) return
                            void portfolioApi.removeMedia(item.id).then(() => feed.reload())
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {showCertificates && certificates.length ? (
            <section className="space-y-3">
              <h2 className="text-title">Certificates & licences</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {certificates.map((cert) => (
                  <Card key={cert.id} className="border border-border-subtle p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon name="workspace_premium" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-caps uppercase text-primary">{cert.kind}</p>
                        <p className="text-title">{cert.title}</p>
                        {cert.issuer ? (
                          <p className="text-label text-on-surface-variant">{cert.issuer}</p>
                        ) : null}
                        <Badge className="mt-2">{cert.status.replace(/_/g, ' ')}</Badge>
                      </div>
                    </div>
                    {cert.documentUrl ? (
                      <a
                        href={resolveMediaUrl(cert.documentUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block text-label font-bold text-primary"
                      >
                        View document →
                      </a>
                    ) : null}
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => void portfolioApi.removeCertificate(cert.id).then(() => feed.reload())}
                    >
                      Delete
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </AsyncStateView>

      <Dialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="Add portfolio item"
        description="Photos, videos, certificates and case studies — uploaded to your live portfolio."
        placement="end"
      >
        <div className="space-y-3">
          <select
            className="h-11 w-full rounded-xl border border-border px-3 text-sm"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            {[
              ['photo', 'Photo'],
              ['before_after', 'Before / after'],
              ['video', 'Video'],
              ['case_study', 'Case study'],
              ['certificate', 'Certificate'],
              ['licence', 'Licence'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Field label="Title">
            <input
              className="h-11 w-full rounded-xl border border-border px-3"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          {form.kind === 'case_study' ? (
            <>
              <Field label="Challenge">
                <TextArea
                  value={form.challenge}
                  onChange={(e) => setForm((f) => ({ ...f, challenge: e.target.value }))}
                />
              </Field>
              <Field label="Solution">
                <TextArea
                  value={form.solution}
                  onChange={(e) => setForm((f) => ({ ...f, solution: e.target.value }))}
                />
              </Field>
              <Field label="Outcome">
                <TextArea
                  value={form.outcome}
                  onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
                />
              </Field>
            </>
          ) : (
            <Field label="Description">
              <TextArea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
          )}
          {(form.kind === 'certificate' || form.kind === 'licence') && (
            <Field label="Issuer">
              <input
                className="h-11 w-full rounded-xl border border-border px-3"
                value={form.issuer}
                onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
              />
            </Field>
          )}
          <Field label="Tags (comma separated)">
            <input
              className="h-11 w-full rounded-xl border border-border px-3"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </Field>
          <div
            className={`rounded-2xl border border-dashed p-6 text-center transition ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void onPickFiles(e.dataTransfer.files)
            }}
          >
            <Icon name="cloud_upload" className="text-3xl text-primary" />
            <p className="mt-2 text-label">Drag & drop or choose from camera / gallery</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <Button className="mt-3" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Uploading…' : 'Choose files'}
            </Button>
            {form.url ? (
              <p className="mt-2 break-all text-caps text-on-surface-variant">Ready: {form.url}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-11 rounded-xl border border-border px-2 text-sm"
              value={form.visibility}
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.customerPermission}
                onChange={(e) => setForm((f) => ({ ...f, customerPermission: e.target.checked }))}
              />
              Customer permission
            </label>
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button
            disabled={busy || !form.title.trim() || (!form.url && form.kind !== 'case_study')}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Publish to portfolio'}
          </Button>
        </div>
      </Dialog>
    </PlanWorkspaceShell>
  )
}
