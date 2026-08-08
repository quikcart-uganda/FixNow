import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@fixnow/utils'
import { PageHeader } from '../../components/ui'

const links = [
  { to: '/admin/marketing', end: true, label: 'Analytics' },
  { to: '/admin/marketing/pending', end: false, label: 'Pending Offers' },
  { to: '/admin/marketing/approved', end: false, label: 'Approved Offers' },
  { to: '/admin/marketing/rejected', end: false, label: 'Rejected Offers' },
  { to: '/admin/marketing/platform', end: false, label: 'Platform Promotions' },
  { to: '/admin/marketing/banners', end: false, label: 'Banner Management' },
  { to: '/admin/marketing/campaigns', end: false, label: 'Sponsored Campaigns' },
  { to: '/admin/marketing/ads', end: false, label: 'Advertisements' },
  { to: '/admin/marketing/content-blocks', end: false, label: 'Dynamic Content' },
  { to: '/admin/marketing/pricing', end: false, label: 'Dynamic Pricing' },
  { to: '/admin/marketing/categories', end: false, label: 'Categories' },
]

export function MarketingLayout() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        subtitle="Manage promotions, sponsored campaigns, advertisements and dynamic content displayed across the platform."
      />
      <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition touch-manipulation',
                isActive
                  ? 'border-primary bg-primary text-white'
                  : 'border-outline-variant text-ink-secondary hover:border-primary/40',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
