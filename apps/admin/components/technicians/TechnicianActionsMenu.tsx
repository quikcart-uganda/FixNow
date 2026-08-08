import type { AdminTechnician } from '@fixnow/types/admin'
import { OverflowMenu } from '../ui'
import { buildTechnicianMenuSections, type TechnicianAction } from './technicianMenu'

export function TechnicianActionsMenu({
  technician,
  acting,
  canDelete,
  label = 'More actions',
  triggerLabel,
  triggerClassName,
  onAction,
}: {
  technician: AdminTechnician
  acting?: boolean
  canDelete?: boolean
  label?: string
  triggerLabel?: string
  triggerClassName?: string
  onAction: (action: TechnicianAction) => void
}) {
  return (
    <OverflowMenu
      label={`${label} for ${technician.name}`}
      triggerLabel={triggerLabel}
      disabled={acting}
      triggerClassName={triggerClassName}
      sections={buildTechnicianMenuSections({
        technician,
        acting,
        canDelete,
        onAction,
      })}
    />
  )
}
