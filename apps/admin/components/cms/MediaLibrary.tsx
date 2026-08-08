import { useCallback, useRef, useState } from 'react'
import { cloudinaryPresetUrl, isCloudinaryDeliveryUrl, resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { getFriendlyErrorMessage } from '@fixnow/api/admin'
import { Button, Icon } from '../ui'

export type MediaAsset = {
  id: string
  url: string
  name: string
  folder: string
  alt?: string
  uploadedAt: string
  publicId?: string
  width?: number
  height?: number
  sizeBytes?: number
  mimeType?: string
  storage?: string
  format?: string
}

const FOLDERS = [
  'Marketing',
  'Categories',
  'Technicians',
  'Articles',
  'Banners',
  'Legal',
  'Education',
  'Uploads',
  'Icons',
] as const

type UploadResult = {
  upload: {
    url: string
    mimeType?: string
    id?: string
    publicId?: string
    width?: number
    height?: number
    sizeBytes?: number
    storage?: string
    format?: string
  }
}

async function uploadFile(file: File, purpose: string): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', purpose)
  const { http } = await import('@fixnow/api/client')
  const res = await http.post('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data as UploadResult
}

async function deleteUpload(id: string) {
  const { http } = await import('@fixnow/api/client')
  await http.delete(`/uploads/${id}`)
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  assets: MediaAsset[]
  onAssetsChange: (next: MediaAsset[]) => void
  onSelect?: (asset: MediaAsset) => void
  selectedUrl?: string
  compact?: boolean
}

export function MediaLibrary({ assets, onAssetsChange, onSelect, selectedUrl, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]>('Articles')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [altDraft, setAltDraft] = useState('')
  const [detail, setDetail] = useState<MediaAsset | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<MediaAsset | null>(null)

  const ingest = useCallback(
    async (files: FileList | File[], replaceOf?: MediaAsset | null) => {
      const list = Array.from(files).filter(
        (f) =>
          /image\/(png|jpeg|jpg|webp|svg\+xml)|image\/svg/i.test(f.type) ||
          /\.(png|jpe?g|webp|svg)$/i.test(f.name),
      )
      if (!list.length) {
        setError('Use PNG, JPG, WEBP, or SVG files.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const uploaded: MediaAsset[] = []
        for (const file of list) {
          const res = await uploadFile(file, `cms-${folder.toLowerCase()}`)
          uploaded.push({
            id: res.upload.id || `${Date.now()}-${file.name}`,
            url: res.upload.url,
            name: file.name,
            folder,
            alt: altDraft || file.name.replace(/\.[^.]+$/, ''),
            uploadedAt: new Date().toISOString(),
            publicId: res.upload.publicId,
            width: res.upload.width,
            height: res.upload.height,
            sizeBytes: res.upload.sizeBytes,
            mimeType: res.upload.mimeType,
            storage: res.upload.storage || 'cloudinary',
            format: res.upload.format,
          })
        }
        let next = [...uploaded, ...assets]
        if (replaceOf) {
          next = next.filter((a) => a.id !== replaceOf.id)
          if (/^[a-f\d]{24}$/i.test(replaceOf.id)) {
            try {
              await deleteUpload(replaceOf.id)
            } catch {
              /* keep going — new asset already uploaded */
            }
          }
        }
        onAssetsChange(next)
        if (uploaded[0] && onSelect) onSelect(uploaded[0])
        if (uploaded[0]) setDetail(uploaded[0])
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setBusy(false)
        setReplaceTarget(null)
      }
    },
    [altDraft, assets, folder, onAssetsChange, onSelect],
  )

  const removeAsset = useCallback(
    async (asset: MediaAsset) => {
      setBusy(true)
      setError(null)
      try {
        if (/^[a-f\d]{24}$/i.test(asset.id)) {
          await deleteUpload(asset.id)
        }
        onAssetsChange(assets.filter((a) => a.id !== asset.id))
        if (detail?.id === asset.id) setDetail(null)
        if (selectedUrl === asset.url) onSelect?.(assets.find((a) => a.id !== asset.id) || ({} as MediaAsset))
      } catch (err) {
        setError(getFriendlyErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [assets, detail?.id, onAssetsChange, onSelect, selectedUrl],
  )

  const filtered = assets.filter((a) => a.folder === folder || folder === 'Uploads')

  return (
    <div className="space-y-4">
      {!compact ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FOLDERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolder(f)}
              className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold touch-manipulation ${
                folder === f ? 'border-primary bg-primary text-white' : 'border-border text-ink-secondary'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) void ingest(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-4 text-center transition sm:p-6 ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-surface-alt/40'
        }`}
      >
        <Icon name="cloud_upload" className="!text-[36px] text-ink-muted" />
        <p className="mt-2 text-sm font-semibold text-ink-primary">Drag & drop images here</p>
        <p className="mt-1 text-xs text-ink-muted">PNG, JPG, WEBP, SVG · stored on Cloudinary CDN</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            disabled={busy}
            className="min-h-11 touch-manipulation"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Uploading…' : 'Upload / Gallery'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void ingest(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={replaceRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void ingest(e.target.files, replaceTarget)
              e.target.value = ''
            }}
          />
        </div>
        <label className="mx-auto mt-3 grid max-w-sm gap-1 text-left text-xs">
          <span className="font-semibold text-ink-muted">Alt text (optional)</span>
          <input
            className="min-h-11 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
            value={altDraft}
            onChange={(e) => setAltDraft(e.target.value)}
            placeholder="Describe the image for accessibility"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {compact ? 'Recently uploaded' : `${folder} library`}
        </p>
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-ink-muted">
            No media in this folder yet. Upload to start building your library.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
            {filtered.map((asset) => (
              <li key={asset.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setDetail(asset)
                    onSelect?.(asset)
                  }}
                  className={`w-full overflow-hidden rounded-xl border text-left transition touch-manipulation ${
                    selectedUrl === asset.url ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="aspect-video bg-surface-alt">
                    <LazyImage
                      src={
                        isCloudinaryDeliveryUrl(asset.url)
                          ? cloudinaryPresetUrl(asset.url, 'thumbnail')
                          : resolveMediaUrl(asset.url)
                      }
                      alt={asset.alt || asset.name}
                      className="h-full w-full object-cover"
                      emptyContent={
                        <span className="flex h-full items-center justify-center text-ink-muted">
                          <Icon name="image" />
                        </span>
                      }
                    />
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-ink-primary">{asset.name}</p>
                    <p className="truncate text-[10px] text-ink-muted">
                      {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                      {asset.storage || asset.folder}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail ? (
        <div className="rounded-2xl border border-border bg-surface-alt/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="font-semibold text-ink-primary">{detail.name}</p>
              <p className="break-all text-xs text-ink-muted">{detail.url}</p>
              {detail.publicId ? (
                <p className="break-all text-xs text-ink-muted">public_id: {detail.publicId}</p>
              ) : null}
              <p className="text-xs text-ink-secondary">
                {detail.width && detail.height ? `${detail.width}×${detail.height}px · ` : ''}
                {formatBytes(detail.sizeBytes)}
                {detail.format ? ` · ${detail.format}` : ''}
                {detail.uploadedAt ? ` · ${new Date(detail.uploadedAt).toLocaleString()}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-10"
                disabled={busy}
                onClick={() => {
                  setReplaceTarget(detail)
                  replaceRef.current?.click()
                }}
              >
                Replace
              </Button>
              <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => void removeAsset(detail)}>
                Delete
              </Button>
            </div>
          </div>
          {isCloudinaryDeliveryUrl(detail.url) ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <LazyImage
                src={cloudinaryPresetUrl(detail.url, 'gallery')}
                alt={detail.alt || detail.name}
                className="max-h-56 w-full object-contain bg-canvas"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export { FOLDERS as MEDIA_FOLDERS }
