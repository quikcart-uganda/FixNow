/**
 * Skip link — first focusable control for keyboard users.
 */

export function SkipLink({
  href = '#fixnow-main',
  children = 'Skip to main content',
}: {
  href?: string
  children?: string
}) {
  return (
    <a href={href} className="fixnow-skip-link">
      {children}
    </a>
  )
}
