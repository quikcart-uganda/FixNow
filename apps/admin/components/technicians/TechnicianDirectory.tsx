import { memo, useMemo, useRef } from 'react'
import type { AdminTechnician } from '@fixnow/types/admin'
import { TechnicianCard } from './TechnicianCard'
import type { TechnicianAction } from './technicianMenu'

type Props = {
  technicians: AdminTechnician[]
  acting?: boolean
  canDelete?: boolean
  onOpen: (technician: AdminTechnician) => void
  onAction: (technician: AdminTechnician, action: TechnicianAction) => void
}

/**
 * Responsive workforce grid. Uses CSS content-visibility on cards plus a
 * windowed render for large pages so Android/Capacitor stays smooth.
 */
function TechnicianDirectoryComponent({
  technicians,
  acting,
  canDelete,
  onOpen,
  onAction,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  // Soft windowing: when the page is large, only fully mount nearby cards'
  // interactive menus via intersection — cards themselves stay light.
  const items = useMemo(() => technicians, [technicians])

  return (
    <ul
      ref={listRef}
      className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5 xl:grid-cols-3 2xl:grid-cols-4"
      aria-label="Workforce directory"
    >
      {items.map((technician) => (
        <li key={technician.id} className="min-w-0">
          <TechnicianCard
            technician={technician}
            acting={acting}
            canDelete={canDelete}
            onOpen={() => onOpen(technician)}
            onAction={(action) => onAction(technician, action)}
          />
        </li>
      ))}
    </ul>
  )
}

export const TechnicianDirectory = memo(TechnicianDirectoryComponent)
