/**
 * Ensure Material Symbols Outlined is registered with a Vite-resolved URL.
 *
 * Why this exists:
 * - `import 'material-symbols/outlined.css'` relies on CSS `url(./…woff2)`.
 * - With Vite `base: './'` (Capacitor) and nested SPA routes, relative font
 *   URLs can 404 depending on how CSS chunks are referenced.
 * - Injecting `@font-face` from a `?url` import makes the src path correct for
 *   web, LAN, production, and Capacitor WebViews.
 */

import symbolsWoff2 from 'material-symbols/material-symbols-outlined.woff2?url'

const STYLE_ID = 'fixnow-material-symbols-font'

let ensurePromise: Promise<boolean> | null = null

export function injectMaterialSymbolsFont(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-fixnow', 'material-symbols')
  style.textContent = `
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 100 700;
  font-display: swap;
  src: url("${symbolsWoff2}") format("woff2");
}
/* Collapse missing-font ligature text so icon names never appear as UI copy */
@font-face {
  font-family: "FixNow Icon Fallback";
  src: local("Arial");
  ascent-override: 90%;
  descent-override: 10%;
  line-gap-override: 0%;
  size-adjust: 0%;
}
`
  document.head.appendChild(style)
}

/** Resolves true when the icon font is usable. */
export function ensureMaterialSymbolsFont(): Promise<boolean> {
  injectMaterialSymbolsFont()
  if (typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve(false)
  }
  if (!ensurePromise) {
    ensurePromise = document.fonts
      .load('24px "Material Symbols Outlined"')
      .then(() => document.fonts.check('24px "Material Symbols Outlined"'))
      .catch(() => false)
  }
  return ensurePromise
}

export const MATERIAL_SYMBOLS_FONT_URL = symbolsWoff2
