import type { AdminTechnician } from '@fixnow/types/admin'
import type { MenuSection } from '../ui'

export type TechnicianAction =
  | { type: 'view' }
  | { type: 'jobs' }
  | { type: 'tracking' }
  | { type: 'suspend' }
  | { type: 'activate' }
  | { type: 'disable' }
  | { type: 'verify' }
  | { type: 'verify-business' }
  | { type: 'reject-business' }
  | { type: 'reset-password' }
  | { type: 'admin-note' }
  | { type: 'audit' }
  | { type: 'notify' }
  | { type: 'export' }
  | { type: 'delete' }
  | { type: 'trust' }

export function buildTechnicianMenuSections({
  technician,
  acting,
  canDelete,
  onAction,
}: {
  technician: AdminTechnician
  acting?: boolean
  canDelete?: boolean
  onAction: (action: TechnicianAction) => void
}): MenuSection[] {
  const locked = technician.lockStatus === 'locked' || technician.lockStatus === 'suspended'
  const active = technician.lockStatus === 'active'
  const verified = technician.verification === 'verified'

  return [
    {
      key: 'navigate',
      label: 'Navigate',
      actions: [
        {
          key: 'view',
          label: 'View profile',
          icon: 'person',
          onSelect: () => onAction({ type: 'view' }),
        },
        {
          key: 'jobs',
          label: 'Manage jobs',
          icon: 'work',
          onSelect: () => onAction({ type: 'jobs' }),
        },
        {
          key: 'tracking',
          label: 'Live tracking',
          icon: 'near_me',
          onSelect: () => onAction({ type: 'tracking' }),
        },
      ],
    },
    {
      key: 'access',
      label: 'Account access',
      actions: [
        {
          key: 'activate',
          label: 'Activate',
          icon: 'check_circle',
          disabled: acting || active,
          hint: active ? 'Already active on the marketplace.' : undefined,
          onSelect: () => onAction({ type: 'activate' }),
        },
        {
          key: 'suspend',
          label: 'Suspend',
          icon: 'pause_circle',
          tone: 'danger',
          disabled: acting || technician.lockStatus === 'suspended',
          hint:
            technician.lockStatus === 'suspended'
              ? 'Already suspended.'
              : undefined,
          onSelect: () => onAction({ type: 'suspend' }),
        },
        {
          key: 'disable',
          label: 'Disable',
          icon: 'block',
          tone: 'danger',
          disabled: acting || locked,
          hint: locked ? 'Account is already locked or suspended.' : undefined,
          onSelect: () => onAction({ type: 'disable' }),
        },
      ],
    },
    {
      key: 'compliance',
      label: 'Compliance',
      actions: [
        {
          key: 'verify',
          label: verified ? 'Already verified' : 'Verify',
          icon: 'verified',
          disabled: acting || verified,
          onSelect: () => onAction({ type: 'verify' }),
        },
        {
          key: 'verify-business',
          label: 'Approve business verification',
          icon: 'apartment',
          disabled: acting,
          onSelect: () => onAction({ type: 'verify-business' }),
        },
        {
          key: 'reject-business',
          label: 'Reject business verification',
          icon: 'domain_disabled',
          tone: 'danger',
          disabled: acting,
          onSelect: () => onAction({ type: 'reject-business' }),
        },
        {
          key: 'admin-note',
          label: 'Assign admin note',
          icon: 'sticky_note_2',
          onSelect: () => onAction({ type: 'admin-note' }),
        },
        {
          key: 'trust',
          label: 'Trust Centre',
          icon: 'verified_user',
          onSelect: () => onAction({ type: 'trust' }),
        },
        {
          key: 'audit',
          label: 'View audit',
          icon: 'history',
          onSelect: () => onAction({ type: 'audit' }),
        },
      ],
    },
    {
      key: 'ops',
      label: 'Operations',
      actions: [
        {
          key: 'reset-password',
          label: 'Reset password',
          icon: 'key',
          onSelect: () => onAction({ type: 'reset-password' }),
        },
        {
          key: 'notify',
          label: 'Send notification',
          icon: 'notifications',
          onSelect: () => onAction({ type: 'notify' }),
        },
        {
          key: 'export',
          label: 'Export',
          icon: 'download',
          onSelect: () => onAction({ type: 'export' }),
        },
      ],
    },
    ...(canDelete
      ? [
          {
            key: 'danger',
            label: 'Danger zone',
            actions: [
              {
                key: 'delete',
                label: 'Delete',
                icon: 'delete',
                tone: 'danger' as const,
                disabled: acting,
                onSelect: () => onAction({ type: 'delete' }),
              },
            ],
          },
        ]
      : []),
  ]
}
