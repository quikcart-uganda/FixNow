import { StatTile, type BadgeTone } from '../ui'
import { ADMIN_STATUS } from './adminHelpers'

export type AdminCounts = {
  total: number
  active: number
  pending: number
  locked: number
  suspended: number
}

const TILES: Array<{
  key: keyof AdminCounts
  label: string
  icon: string
  tone: BadgeTone
  status: string | null
}> = [
  { key: 'total', label: 'Total', icon: 'groups', tone: 'info', status: null },
  { key: 'active', label: 'Active', icon: 'check_circle', tone: 'success', status: ADMIN_STATUS.active },
  {
    key: 'pending',
    label: 'Pending',
    icon: 'hourglass_top',
    tone: 'info',
    status: ADMIN_STATUS.pendingInvitation,
  },
  { key: 'locked', label: 'Locked', icon: 'lock', tone: 'locked', status: ADMIN_STATUS.locked },
  {
    key: 'suspended',
    label: 'Suspended',
    icon: 'pause_circle',
    tone: 'warning',
    status: ADMIN_STATUS.suspended,
  },
]

/**
 * Summary tiles double as status filters: mobile scrolls horizontally,
 * tablet uses two columns, desktop uses four.
 */
export function AdminSummaryCards({
  counts,
  loading = false,
  selectedStatus,
  onSelectStatus,
}: {
  counts: AdminCounts | null
  loading?: boolean
  selectedStatus: string
  onSelectStatus: (status: string) => void
}) {
  return (
    <div
      aria-busy={loading}
      aria-label="Administrator totals"
      role="group"
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4 2xl:grid-cols-5"
    >
      {TILES.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          icon={tile.icon}
          tone={tile.tone}
          value={counts ? counts[tile.key] : null}
          active={(tile.status ?? '') === selectedStatus}
          onClick={() => onSelectStatus(tile.status ?? '')}
          className="w-[168px] shrink-0 snap-start md:w-auto"
        />
      ))}
    </div>
  )
}
