import type { SVGProps } from 'react'

type HeaderGlyphName = 'notifications' | 'close'

/** Inline header-critical icons that cannot depend on a downloadable font. */
export function HeaderGlyph({
  name,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { name: HeaderGlyphName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      className={`block h-6 w-6 shrink-0 overflow-visible ${className}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {name === 'notifications' ? (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.75 21h-3.5" />
        </>
      ) : (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      )}
    </svg>
  )
}
