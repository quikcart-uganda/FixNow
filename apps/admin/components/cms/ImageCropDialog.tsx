import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Icon } from '../ui'

type Props = {
  open: boolean
  imageUrl: string
  aspect?: number
  onClose: () => void
  /** Receives a cropped JPEG blob ready for upload */
  onCropped: (blob: Blob, previewUrl: string) => void
}

/**
 * Lightweight 16:9 crop studio for banner hero images.
 * Drag to pan; wheel / buttons to zoom. Exports JPEG for upload.
 */
export function ImageCropDialog({ open, imageUrl, aspect = 21 / 9, onClose, onCropped }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !imageUrl) return
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      setImg(image)
      setScale(1)
      setOffset({ x: 0, y: 0 })
    }
    image.src = imageUrl
  }, [open, imageUrl])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, w, h)

    const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scale
    const dw = img.naturalWidth * cover
    const dh = img.naturalHeight * cover
    const dx = (w - dw) / 2 + offset.x
    const dy = (h - dh) / 2 + offset.y
    ctx.drawImage(img, dx, dy, dw, dh)
  }, [img, offset.x, offset.y, scale])

  useEffect(() => {
    draw()
  }, [draw])

  if (!open) return null

  const exportCrop = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
      )
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      onCropped(blob, previewUrl)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-canvas-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-primary">Crop hero image</h3>
          <button type="button" onClick={onClose} aria-label="Close crop" className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt">
            <Icon name="close" />
          </button>
        </div>
        <p className="text-xs text-ink-muted">Drag to reposition · use zoom for focal points · exports JPEG {aspect.toFixed(2)}:1</p>
        <div className="overflow-hidden rounded-xl border border-border bg-slate-900">
          <canvas
            ref={canvasRef}
            width={840}
            height={Math.round(840 / aspect)}
            className="w-full touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
              ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              setOffset({
                x: drag.current.ox + (e.clientX - drag.current.x),
                y: drag.current.oy + (e.clientY - drag.current.y),
              })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            onWheel={(e) => {
              e.preventDefault()
              setScale((s) => Math.min(3, Math.max(0.6, s + (e.deltaY < 0 ? 0.08 : -0.08))))
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-xs text-ink-secondary">
            Zoom
            <input
              type="range"
              min={0.6}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !img} onClick={() => void exportCrop()}>
            {busy ? 'Saving…' : 'Apply crop'}
          </Button>
        </div>
      </div>
    </div>
  )
}
