import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@fixnow/utils'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'

const links = [
  { to: '/technician/marketing', end: true, label: 'Dashboard' },
  { to: '/technician/marketing/creatives', end: false, label: 'Slides & banners' },
  { to: '/technician/marketing/offers', end: true, label: 'My Offers' },
  { to: '/technician/marketing/create', end: false, label: 'Create Offer' },
  { to: '/technician/marketing/drafts', end: false, label: 'Drafts' },
  { to: '/technician/marketing/pending', end: false, label: 'Pending Approval' },
  { to: '/technician/marketing/scheduled', end: false, label: 'Scheduled' },
  { to: '/technician/marketing/active', end: false, label: 'Active' },
  { to: '/technician/marketing/expired', end: false, label: 'Expired' },
  { to: '/technician/marketing/rejected', end: false, label: 'Rejected' },
  { to: '/technician/marketing/analytics', end: false, label: 'Analytics' },
]

export function MarketingLayout() {
  const tier = usePlanWorkspaceTier()

  return (
    <PlanWorkspaceShell page="marketing">
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {links.map((link) => (
          <NavLink
            key={link.to + link.label}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition fn-pressable',
                isActive
                  ? tier === 'business'
                    ? 'border-teal-800 bg-teal-800 text-white'
                    : 'border-primary bg-primary text-white'
                  : 'border-border-subtle bg-canvas-white text-on-surface-variant hover:border-primary/40',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div
        className={cn(
          tier === 'professional' && 'rounded-2xl border border-primary/10 bg-primary/[0.02] p-1',
          tier === 'business' && 'rounded-2xl border border-teal-900/10 bg-teal-900/[0.03] p-1',
        )}
      >
        <Outlet />
      </div>
    </PlanWorkspaceShell>
  )
}
