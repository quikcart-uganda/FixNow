/**
 * Contextual action definitions for one administrator row. Kept separate from
 * the menu component so the action set can be reused and unit-reasoned about.
 */

import type { MenuSection } from '../ui'
import { ADMIN_STATUS, statusMeta, type AdminOperator } from './adminHelpers'

export type AdminDetailTab =
  | 'profile'
  | 'permissions'
  | 'history'
  | 'devices'
  | 'sessions'
  | 'recovery'
  | 'audit'

export type AdminAction =
  | { type: 'status'; status: string }
  | { type: 'open'; tab: AdminDetailTab }

type LifecycleEntry = { key: string; label: string; icon: string; status: string }

const LIFECYCLE: LifecycleEntry[] = [
  { key: 'activate', label: 'Activate', icon: 'check_circle', status: ADMIN_STATUS.active },
  { key: 'suspend', label: 'Suspend', icon: 'pause_circle', status: ADMIN_STATUS.suspended },
  { key: 'disable', label: 'Disable', icon: 'block', status: ADMIN_STATUS.disabled },
  { key: 'lock', label: 'Lock', icon: 'lock', status: ADMIN_STATUS.locked },
]

const DANGER: LifecycleEntry[] = [
  { key: 'archive', label: 'Archive', icon: 'inventory_2', status: ADMIN_STATUS.archived },
  { key: 'delete', label: 'Delete', icon: 'delete', status: ADMIN_STATUS.deleted },
]

export function buildAdminMenuSections({
  admin,
  isSelf,
  onAction,
}: {
  admin: AdminOperator
  isSelf: boolean
  onAction: (action: AdminAction) => void
}): MenuSection[] {
  const lifecycleAction = (entry: LifecycleEntry) => {
    const already = admin.status === entry.status
    return {
      key: entry.key,
      label: entry.label,
      icon: entry.icon,
      disabled: isSelf || already,
      hint: isSelf
        ? 'You cannot change your own administrator status.'
        : already
          ? `Already ${statusMeta(entry.status).label.toLowerCase()}.`
          : undefined,
      onSelect: () => onAction({ type: 'status', status: entry.status }),
    }
  }

  return [
    { key: 'lifecycle', label: 'Lifecycle', actions: LIFECYCLE.map(lifecycleAction) },
    {
      key: 'security',
      label: 'Security',
      actions: [
        {
          key: 'reset-password',
          label: 'Reset password',
          icon: 'key',
          onSelect: () => onAction({ type: 'open', tab: 'recovery' }),
        },
        {
          key: 'permissions',
          label: 'View permissions',
          icon: 'shield_person',
          onSelect: () => onAction({ type: 'open', tab: 'permissions' }),
        },
        {
          key: 'login-history',
          label: 'Login history',
          icon: 'history',
          onSelect: () => onAction({ type: 'open', tab: 'history' }),
        },
      ],
    },
    {
      key: 'danger',
      label: 'Danger zone',
      actions: DANGER.map((entry) => ({ ...lifecycleAction(entry), tone: 'danger' as const })),
    },
  ]
}
