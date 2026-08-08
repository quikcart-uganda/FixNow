import { Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'

type AuthAlertProps = {
  message?: string | null
  tone?: 'error' | 'success' | 'info'
  className?: string
  id?: string
}

export function AuthAlert({ message, tone = 'error', className, id }: AuthAlertProps) {
  if (!message) return null

  const styles =
    tone === 'success'
      ? 'border-success-green/30 bg-success-green/5 text-success-green'
      : tone === 'info'
        ? 'border-primary/25 bg-primary/5 text-on-surface'
        : 'border-error/30 bg-error/5 text-error'

  const icon = tone === 'success' ? 'check_circle' : tone === 'info' ? 'info' : 'error'

  return (
    <div
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', styles, className)}
    >
      <Icon name={icon} className="mt-0.5 shrink-0 text-[18px]" />
      <span>{message}</span>
    </div>
  )
}
