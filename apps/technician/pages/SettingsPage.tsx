import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { useAuth } from '@fixnow/hooks'
import { SwitchRoleControl } from '@fixnow/shared'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { cn } from '@fixnow/utils'

const groups = [
  {
    title: 'Account',
    items: [
      ['/technician/profile', 'badge', 'Profile & services'],
      ['/technician/profile-setup', 'checklist', 'Profile setup & completion'],
      ['/technician/availability', 'schedule', 'Availability & working hours'],
      ['/technician/service-areas', 'map', 'Coverage areas'],
    ],
  },
  {
    title: 'Subscription & Billing',
    items: [
      ['/technician/settings/billing', 'receipt_long', 'Subscription & Billing'],
      ['/technician/upgrade', 'workspace_premium', 'Upgrade Plan'],
      ['/technician/subscription', 'verified', 'View Current Benefits'],
      ['/technician/help', 'support_agent', 'Billing support'],
    ],
  },
  {
    title: 'Preferences',
    items: [
      ['/technician/notifications', 'notifications', 'Notification preferences'],
      ['/technician/settings/privacy', 'privacy_tip', 'Privacy'],
      ['/technician/guarantee', 'verified_user', 'FixNow Guarantee'],
    ],
  },
  {
    title: 'Support',
    items: [
      ['/technician/help', 'help', 'Help Center'],
      ['/technician/content/terms', 'gavel', 'Terms'],
      ['/technician/content/privacy-policy', 'policy', 'Privacy policy'],
      ['/technician/community', 'forum', 'Community & DIY tips'],
      ['/technician/account/delete', 'person_off', 'Delete account'],
    ],
  },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { setOnboarded } = useApp()
  const tier = usePlanWorkspaceTier()

  return (
    <PlanWorkspaceShell page="settings">
      {groups.map((group) => (
        <div key={group.title} className="space-y-2">
          <h2 className="text-caps text-outline">{group.title}</h2>
          <Card
            className={cn(
              'overflow-hidden divide-y divide-border-subtle',
              tier === 'professional' && 'fn-premium-surface',
              tier === 'business' && 'fn-executive-surface',
            )}
          >
            {group.items.map(([to, icon, label]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-container-low fn-pressable"
              >
                <Icon name={icon} className="text-primary" />
                <span className="flex-1 text-label font-semibold">{label}</span>
                <Icon name="chevron_right" className="text-outline" />
              </Link>
            ))}
          </Card>
        </div>
      ))}

      <SwitchRoleControl />

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-error/30 bg-error-container/40 px-4 py-3 text-label font-semibold text-on-error-container fn-pressable"
        onClick={async () => {
          await logout()
          setOnboarded(false)
          navigate('/technician/login')
        }}
      >
        <Icon name="logout" />
        Logout
      </button>
    </PlanWorkspaceShell>
  )
}
