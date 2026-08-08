/**
 * Lazy image with decode-friendly defaults for mobile lists.
 * Shows a skeleton while loading; retries the primary URL once before fallback.
 * Never leaves a broken browser image icon or blank area.
 * Prefer Cloudinary srcSet when provided for responsive delivery.
 */

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react'
import { logImageDiag } from '@fixnow/assets'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: string
  /** Called when primary + retry + fallback all fail. */
  onExhausted?: () => void
  /** Custom empty state (defaults to branded image placeholder). */
  emptyContent?: ReactNode
  /** Diagnostics: which screen/component requested this image. */
  diagComponent?: string
  /** Diagnostics: related entity id (category, promo, job, …). */
  diagEntityId?: string
}

type Phase = 'load' | 'retry' | 'fallback' | 'done' | 'empty'

export function LazyImage({
  fallback,
  className = '',
  alt = '',
  loading = 'lazy',
  decoding = 'async',
  onExhausted,
  emptyContent,
  srcSet,
  sizes,
  diagComponent,
  diagEntityId,
  ...rest
}: Props) {
  const source = String(rest.src || '')
  const [phase, setPhase] = useState<Phase>(source ? 'load' : fallback ? 'fallback' : 'empty')
  const [visible, setVisible] = useState(false)
  const [bust, setBust] = useState(0)
  const retriedRef = useRef(false)
  const exhaustedRef = useRef(false)
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now())

  useEffect(() => {
    retriedRef.current = false
    exhaustedRef.current = false
    setBust(0)
    setVisible(false)
    startedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setPhase(source ? 'load' : fallback ? 'fallback' : 'empty')
    if (source) {
      logImageDiag({
        phase: 'start',
        requestedUrl: source,
        component: diagComponent,
        entityId: diagEntityId,
      })
    }
  }, [source, fallback, diagComponent, diagEntityId])

  useEffect(() => {
    if (phase === 'empty' && !exhaustedRef.current) {
      exhaustedRef.current = true
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      logImageDiag({
        phase: 'exhausted',
        requestedUrl: source || String(fallback || ''),
        component: diagComponent,
        entityId: diagEntityId,
        fallbackUsed: Boolean(fallback),
        durationMs: Math.round(now - startedAtRef.current),
        error: 'primary_and_fallback_failed',
      })
      onExhausted?.()
    }
  }, [phase, onExhausted, source, fallback, diagComponent, diagEntityId])

  if (phase === 'empty') {
    if (emptyContent) return <>{emptyContent}</>
    return (
      <span
        role="img"
        aria-label={alt || 'Image unavailable'}
        className={`inline-flex items-center justify-center bg-gradient-to-br from-primary/15 via-surface-container to-surface-container-high text-primary ${className}`}
      >
        <span className="material-symbols-outlined text-2xl opacity-80" aria-hidden="true">
          image
        </span>
      </span>
    )
  }

  const usingFallback = phase === 'fallback'
  const raw = usingFallback ? String(fallback || '') : source
  const src =
    !usingFallback && bust > 0 && raw
      ? `${raw}${raw.includes('?') ? '&' : '?'}r=${bust}`
      : raw

  return (
    <span className={`relative inline-block overflow-hidden ${className}`}>
      {!visible ? <span aria-hidden className="skeleton absolute inset-0 block" /> : null}
      {src ? (
        <img
          {...rest}
          key={`${src}-${phase}`}
          src={src}
          srcSet={usingFallback ? undefined : srcSet}
          sizes={usingFallback ? undefined : sizes}
          alt={alt}
          className={`h-full w-full object-cover transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
          loading={loading}
          decoding={decoding}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            setVisible(true)
            setPhase('done')
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
            logImageDiag({
              phase: usingFallback ? 'fallback' : 'success',
              requestedUrl: source || src,
              finalUrl: src,
              component: diagComponent,
              entityId: diagEntityId,
              fallbackUsed: usingFallback,
              durationMs: Math.round(now - startedAtRef.current),
            })
            rest.onLoad?.(e)
          }}
          onError={(e) => {
            rest.onError?.(e)
            setVisible(false)
            if (!usingFallback && !retriedRef.current && source) {
              retriedRef.current = true
              setBust(Date.now())
              setPhase('retry')
              logImageDiag({
                phase: 'retry',
                requestedUrl: source,
                component: diagComponent,
                entityId: diagEntityId,
                error: 'primary_load_failed',
              })
              return
            }
            if (!usingFallback && fallback && fallback !== source) {
              setPhase('fallback')
              logImageDiag({
                phase: 'fallback',
                requestedUrl: source,
                finalUrl: fallback,
                component: diagComponent,
                entityId: diagEntityId,
                fallbackUsed: true,
                error: 'switching_to_fallback',
              })
              return
            }
            setPhase('empty')
          }}
        />
      ) : null}
    </span>
  )
}
