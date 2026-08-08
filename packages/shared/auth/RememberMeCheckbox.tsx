import { useId } from 'react'
import { cn } from '@fixnow/utils'

type RememberMeCheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  className?: string
}

export function RememberMeCheckbox({
  checked,
  onChange,
  label = 'Remember me on this device',
  className,
}: RememberMeCheckboxProps) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2.5 text-sm text-on-surface-variant', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] rounded border-border-subtle accent-[var(--color-primary,#2563eb)]"
      />
      <span>{label}</span>
    </label>
  )
}
