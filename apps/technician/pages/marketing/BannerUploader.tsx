import { useEffect, useRef, useState } from 'react'
import { getFriendlyErrorMessage, offersApi } from '@fixnow/api'
import { Button, Icon } from '@fixnow/ui'

const TARGET_RATIO = 16 / 9
const MAX_WIDTH = 1280
const QUALITY = 0.82

/**
 * Center-crops to 16:9 around a technician-chosen focal point, downscales to
 * 1280px and re-encodes as JPEG so banners stay light on mobile data.
 */
async function cropAndOptimise(file: File, focalY: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const srcRatio = bitmap.width / bitmap.height

  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height

  if (srcRatio > TARGET_RATIO) {
    sw = Math.round(bitmap.height * TARGET_RATIO)
    sx = Math.round((bitmap.width - sw) / 2)
  } else {
    sh = Math.round(bitmap.width / TARGET_RATIO)
    const maxOffset = bitmap.height - sh
    sy = Math.round(Math.min(Math.max(focalY * bitmap.height - sh / 2, 0), maxOffset))
  }

  const outWidth = Math.min(MAX_WIDTH, sw)
  const outHeight = Math.round(outWidth / TARGET_RATIO)

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outWidth, outHeight)
  bitmap.close?.()

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
      'image/jpeg',
      QUALITY,
    )
  })
}

export function BannerUploader({
  value,
  onChange,
}: {
  value?: string
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [focalY, setFocalY] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pending) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pending)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pending])

  const pick = (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (JPG or PNG).')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image is larger than 8MB. Pick a smaller one.')
      return
    }
    setFocalY(0.5)
    setPending(file)
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const blob = await cropAndOptimise(pending, focalY)
      const optimised = new File([blob], `offer-banner-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const res = await offersApi.uploadBanner(optimised)
      onChange(res.upload.url)
      setPending(null)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {pending && previewUrl ? (
        <div className="space-y-3 rounded-2xl border border-border-subtle p-3">
          <p className="text-label text-on-surface-variant">Crop preview (16:9)</p>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-container-low">
            <img
              src={previewUrl}
              alt="Banner crop preview"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `50% ${focalY * 100}%` }}
            />
          </div>
          <label className="block space-y-1">
            <span className="text-label text-on-surface-variant">Vertical framing</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={focalY}
              onChange={(e) => setFocalY(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Adjust banner vertical framing"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Optimising…' : 'Use this banner'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant">
            Cropped to 16:9, resized to 1280px and compressed automatically.
          </p>
        </div>
      ) : value ? (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border-subtle">
            <img src={value} alt="Offer banner" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button size="sm" variant="outline" onClick={() => onChange('')}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-subtle px-4 py-8 text-center transition hover:border-primary/50"
        >
          <Icon name="add_photo_alternate" className="text-primary" />
          <span className="text-sm font-semibold text-on-surface">Upload a banner</span>
          <span className="text-xs text-on-surface-variant">
            Offers with a photo get noticed more. JPG or PNG, up to 8MB.
          </span>
        </button>
      )}

      {error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  )
}
