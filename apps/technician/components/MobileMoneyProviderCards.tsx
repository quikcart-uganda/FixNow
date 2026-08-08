import { cn } from '@fixnow/utils'

export type MobileMoneyProviderId = 'mtn' | 'airtel'

type MobileMoneyProviderCardsProps = {
  value: MobileMoneyProviderId
  onChange: (provider: MobileMoneyProviderId) => void
  disabled?: boolean
  className?: string
}

/** Simple brand-inspired marks — not official trademarks. */
function MtnMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#111111" />
      <path
        d="M8 28V12h5.2l3.3 9.6L19.8 12H25v16h-4.2v-9.2L17.2 28h-3.4l-3.6-9.2V28H8zm20.5 0V12h4.3v16h-4.3z"
        fill="#FFCC00"
      />
    </svg>
  )
}

function AirtelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E60000" />
      <path
        d="M20 8c6.6 0 12 5.4 12 12s-5.4 12-12 12S8 26.6 8 20 13.4 8 20 8zm0 4.2c-4.3 0-7.8 3.5-7.8 7.8 0 2.5 1.2 4.7 3 6.1l1.7-2.6c-1.1-.9-1.8-2.2-1.8-3.5 0-2.6 2.1-4.7 4.7-4.7s4.7 2.1 4.7 4.7c0 1.3-.7 2.6-1.8 3.5l1.7 2.6c1.8-1.4 3-3.6 3-6.1 0-4.3-3.5-7.8-7.8-7.8z"
        fill="#FFFFFF"
      />
      <circle cx="20" cy="20" r="2.4" fill="#FFFFFF" />
    </svg>
  )
}

const PROVIDERS: Array<{
  id: MobileMoneyProviderId
  name: string
  product: string
  hint: string
  Mark: typeof MtnMark
  selectedClass: string
  idleClass: string
  accentBar: string
}> = [
  {
    id: 'mtn',
    name: 'MTN',
    product: 'MoMo',
    hint: 'MTN Mobile Money',
    Mark: MtnMark,
    selectedClass:
      'border-[#111111] bg-[#FFCC00] shadow-[0_8px_24px_rgba(255,204,0,0.35)] ring-2 ring-[#111111]/15',
    idleClass: 'border-border-subtle bg-canvas-white hover:border-[#FFCC00]/80 hover:bg-[#FFCC00]/10',
    accentBar: 'bg-[#111111]',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    product: 'Money',
    hint: 'Airtel Money',
    Mark: AirtelMark,
    selectedClass:
      'border-[#E60000] bg-[#E60000] text-white shadow-[0_8px_24px_rgba(230,0,0,0.28)] ring-2 ring-[#E60000]/25',
    idleClass: 'border-border-subtle bg-canvas-white hover:border-[#E60000]/55 hover:bg-[#E60000]/5',
    accentBar: 'bg-[#E60000]',
  },
]

/**
 * Brand-inspired Mobile Money selector for technician registration.
 * Uses official colour cues and original SVG marks — not copyrighted logos.
 */
export function MobileMoneyProviderCards({
  value,
  onChange,
  disabled,
  className,
}: MobileMoneyProviderCardsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Mobile Money provider"
      className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}
    >
      {PROVIDERS.map((provider) => {
        const selected = value === provider.id
        const Mark = provider.Mark
        return (
          <button
            key={provider.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(provider.id)}
            className={cn(
              'group relative min-h-[5.5rem] overflow-hidden rounded-2xl border-2 p-4 text-left transition active:scale-[0.98] disabled:opacity-50',
              'touch-manipulation tap-target',
              selected ? provider.selectedClass : provider.idleClass,
              provider.id === 'mtn' && selected ? 'text-[#111111]' : null,
            )}
          >
            <span
              className={cn(
                'absolute inset-y-0 left-0 w-1.5',
                selected ? provider.accentBar : 'bg-transparent',
              )}
              aria-hidden="true"
            />
            <span className="flex items-center gap-3 pl-1">
              <Mark className="h-11 w-11 shrink-0 rounded-[10px] shadow-sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-title font-bold tracking-tight">{provider.name}</span>
                  <span
                    className={cn(
                      'text-label font-semibold',
                      selected && provider.id === 'airtel'
                        ? 'text-white/90'
                        : 'text-on-surface-variant',
                      selected && provider.id === 'mtn' ? 'text-[#111111]/75' : null,
                    )}
                  >
                    {provider.product}
                  </span>
                </span>
                <span
                  className={cn(
                    'mt-0.5 block text-caps',
                    selected && provider.id === 'airtel'
                      ? 'text-white/80'
                      : 'text-on-surface-variant',
                    selected && provider.id === 'mtn' ? 'text-[#111111]/70' : null,
                  )}
                >
                  {provider.hint}
                </span>
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition',
                  selected
                    ? provider.id === 'mtn'
                      ? 'border-[#111111] bg-[#111111] text-[#FFCC00]'
                      : 'border-white bg-white text-[#E60000]'
                    : 'border-border-subtle bg-transparent text-transparent',
                )}
                aria-hidden="true"
              >
                <span className="material-symbols-outlined text-[1rem] font-bold">check</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
