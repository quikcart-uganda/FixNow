import type { SVGProps } from 'react'

/**
 * Dependency-free menu glyph. Inline SVG guarantees the hamburger remains
 * visible when remote icon fonts are blocked, offline, or unavailable in a
 * Capacitor WebView.
 */
export function HamburgerIcon({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      className={`block h-6 w-6 shrink-0 overflow-visible ${className}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  )
}
