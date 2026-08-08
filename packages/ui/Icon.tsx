import { cn } from '@fixnow/utils'
import { useEffect, useState, type CSSProperties } from 'react'
import { ensureMaterialSymbolsFont, injectMaterialSymbolsFont } from './materialSymbols'

injectMaterialSymbolsFont()

interface IconProps {
  /** Material Symbols ligature name, e.g. "search", "verified", "arrow_forward". */
  name: string
  className?: string
  /** When true, sets FILL=1 via `.fill-icon`. */
  filled?: boolean
  style?: CSSProperties
}

/**
 * Canonical FixNow icon — Material Symbols Outlined ligature.
 *
 * Font is self-hosted (see `materialSymbols.ts`) so glyphs work offline, on
 * LAN, and in Capacitor. While the font is unavailable we render a neutral
 * geometric fallback — never the raw ligature name as visible UI text.
 */
export function Icon({ name, className, filled, style }: IconProps) {
  const [fontReady, setFontReady] = useState(() => {
    if (typeof document === 'undefined' || !document.fonts) return false
    try {
      return document.fonts.check('24px "Material Symbols Outlined"')
    } catch {
      return false
    }
  })

  useEffect(() => {
    let cancelled = false
    void ensureMaterialSymbolsFont().then((ok) => {
      if (!cancelled) setFontReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!fontReady) {
    return (
      <span
        className={cn('fixnow-icon-fallback', className)}
        style={style}
        aria-hidden
        data-icon={name}
        title={undefined}
      />
    )
  }

  return (
    <span
      className={cn('material-symbols-outlined', filled && 'fill-icon', className)}
      style={style}
      aria-hidden
      translate="no"
      data-icon={name}
    >
      {name}
    </span>
  )
}
