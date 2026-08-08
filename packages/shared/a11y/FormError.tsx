/** Inline form / action error with assertive live region. */

export function FormError({
  id,
  children,
  className = '',
}: {
  id?: string
  children: string
  className?: string
}) {
  if (!children) return null
  return (
    <p
      id={id}
      role="alert"
      aria-live="assertive"
      className={
        className ||
        'rounded-lg border border-error/30 bg-error-container px-4 py-3 text-body-sm text-error'
      }
    >
      {children}
    </p>
  )
}
