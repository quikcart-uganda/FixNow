import type { HeaderMenuItem, PortalRole } from './types'

/** Role-aware account menu destinations — only existing routes. */
export function profileMenuItems(role: PortalRole): HeaderMenuItem[] {
  if (role === 'customer') {
    return [
      { id: 'profile', label: 'Profile', icon: 'person', to: '/customer/profile' },
      { id: 'jobs', label: 'My jobs', icon: 'work_history', to: '/customer/jobs' },
      { id: 'payments', label: 'Payments', icon: 'payments', to: '/customer/payments' },
      { id: 'offers', label: 'Saved offers', icon: 'local_offer', to: '/customer/offers/saved' },
      { id: 'notifications', label: 'Notification settings', icon: 'notifications', to: '/customer/notifications' },
      { id: 'help', label: 'Help', icon: 'help', to: '/customer/help' },
      { id: 'logout', label: 'Log out', icon: 'logout', action: 'logout', danger: true },
    ]
  }
  if (role === 'technician') {
    return [
      { id: 'profile', label: 'Profile', icon: 'person', to: '/technician/profile' },
      { id: 'availability', label: 'Availability', icon: 'toggle_on', to: '/technician/availability' },
      { id: 'portfolio', label: 'Portfolio / documents', icon: 'photo_library', to: '/technician/portfolio' },
      { id: 'earnings', label: 'Wallet & earnings', icon: 'account_balance_wallet', to: '/technician/earnings' },
      { id: 'settings', label: 'Settings', icon: 'settings', to: '/technician/settings' },
      { id: 'help', label: 'Help', icon: 'help', to: '/technician/help' },
      { id: 'logout', label: 'Log out', icon: 'logout', action: 'logout', danger: true },
    ]
  }
  return [
    {
      id: 'status',
      label: 'Connection',
      icon: 'sensors',
      action: 'status',
      description: 'Check connection and notifications',
    },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', to: '/admin/dashboard' },
    { id: 'admins', label: 'Administrators', icon: 'admin_panel_settings', to: '/admin/admins' },
    { id: 'audit', label: 'Audit activity', icon: 'history', to: '/admin/audit' },
    { id: 'dev', label: 'Preferences / controls', icon: 'tune', to: '/admin/settings/development' },
    {
      id: 'security',
      label: 'Security',
      icon: 'security',
      action: 'coming_soon',
      description: 'Device and session security controls are coming soon.',
    },
    {
      id: 'devices',
      label: 'Devices & sessions',
      icon: 'devices',
      action: 'coming_soon',
      description: 'Session management will appear here soon.',
    },
    { id: 'logout', label: 'Sign out', icon: 'logout', action: 'logout', danger: true },
  ]
}

export function customerNavItems(): HeaderMenuItem[] {
  return [
    { id: 'home', label: 'Home', icon: 'home', to: '/customer/home', section: 'Main' },
    { id: 'search', label: 'Search', icon: 'search', to: '/customer/search', section: 'Main' },
    { id: 'post', label: 'Post a job', icon: 'add_circle', to: '/customer/post-job', section: 'Main' },
    { id: 'jobs', label: 'My jobs', icon: 'work_history', to: '/customer/jobs', section: 'Main' },
    { id: 'messages', label: 'Messages', icon: 'chat', to: '/customer/messages', section: 'Main' },
    { id: 'offers', label: 'Offers', icon: 'local_offer', to: '/customer/offers', section: 'Main' },
    { id: 'profile', label: 'Profile', icon: 'person', to: '/customer/profile', section: 'Account' },
  ]
}

/** Guest drawer — browse + auth CTAs; no private account destinations. */
export function guestCustomerNavItems(): HeaderMenuItem[] {
  return [
    { id: 'home', label: 'Home', icon: 'home', to: '/customer/home', section: 'Explore' },
    { id: 'search', label: 'Search', icon: 'search', to: '/customer/search', section: 'Explore' },
    { id: 'offers', label: 'Offers', icon: 'local_offer', to: '/customer/offers', section: 'Explore' },
    { id: 'categories', label: 'Categories', icon: 'category', to: '/customer/categories', section: 'Explore' },
    { id: 'help', label: 'Help', icon: 'help', to: '/customer/help', section: 'Support' },
    {
      id: 'safety',
      label: 'Safety',
      icon: 'shield',
      to: '/customer/content/safety',
      section: 'Support',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      to: '/customer/help',
      section: 'Support',
      description: 'Language, appearance, and accessibility',
    },
    {
      id: 'become-tech',
      label: 'Become Technician',
      icon: 'handyman',
      to: '/technician/register',
      section: 'Account',
    },
    {
      id: 'sign-in',
      label: 'Sign In',
      icon: 'login',
      to: '/customer/login',
      section: 'Account',
    },
    {
      id: 'create-account',
      label: 'Create Account',
      icon: 'person_add',
      to: '/customer/register',
      section: 'Account',
    },
  ]
}

export function guestProfileMenuItems(): HeaderMenuItem[] {
  return [
    { id: 'sign-in', label: 'Sign In', icon: 'login', to: '/customer/login' },
    { id: 'create-account', label: 'Create Account', icon: 'person_add', to: '/customer/register' },
    { id: 'become-tech', label: 'Become Technician', icon: 'handyman', to: '/technician/register' },
    { id: 'help', label: 'Help', icon: 'help', to: '/customer/help' },
    { id: 'safety', label: 'Safety', icon: 'shield', to: '/customer/content/safety' },
  ]
}

/**
 * Technician hamburger drawer — only routes that exist in TechnicianRoutes.
 * Grouped for scanability; not a hard-coded fake list of unavailable screens.
 */
export function technicianNavItems(): HeaderMenuItem[] {
  return [
    { id: 'home', label: 'Home', icon: 'dashboard', to: '/technician/dashboard', section: 'Work' },
    { id: 'jobs', label: 'Nearby jobs', icon: 'near_me', to: '/technician/jobs', section: 'Work' },
    { id: 'active', label: 'Active jobs', icon: 'assignment', to: '/technician/active', section: 'Work' },
    { id: 'inbox', label: 'Inbox', icon: 'chat', to: '/technician/messages', section: 'Work' },
    {
      id: 'availability',
      label: 'Availability',
      icon: 'toggle_on',
      to: '/technician/availability',
      section: 'Work',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: 'photo_library',
      to: '/technician/portfolio',
      section: 'Growth',
    },
    {
      id: 'earnings',
      label: 'Earnings & wallet',
      icon: 'account_balance_wallet',
      to: '/technician/earnings',
      section: 'Growth',
    },
    {
      id: 'reputation',
      label: 'Trust & reputation',
      icon: 'workspace_premium',
      to: '/technician/reputation',
      section: 'Growth',
    },
    {
      id: 'achievements',
      label: 'Performance',
      icon: 'emoji_events',
      to: '/technician/achievements',
      section: 'Growth',
    },
    { id: 'reviews', label: 'Reviews', icon: 'star', to: '/technician/reviews', section: 'Growth' },
    { id: 'marketing', label: 'Marketing', icon: 'campaign', to: '/technician/marketing', section: 'Growth' },
    {
      id: 'boosts',
      label: 'Profile Boosts',
      icon: 'rocket_launch',
      to: '/technician/boosts',
      section: 'Growth',
    },
    {
      id: 'upgrade',
      label: 'Upgrade Plan',
      icon: 'upgrade',
      to: '/technician/upgrade',
      section: 'Growth',
    },
    {
      id: 'subscription',
      label: 'Subscription Centre',
      icon: 'workspace_premium',
      to: '/technician/subscription',
      section: 'Growth',
    },
    {
      id: 'billing',
      label: 'Subscription & Billing',
      icon: 'receipt_long',
      to: '/technician/settings/billing',
      section: 'Account',
    },
    { id: 'referrals', label: 'Referrals', icon: 'share', to: '/technician/referrals', section: 'Growth' },
    { id: 'community', label: 'Community', icon: 'forum', to: '/technician/community', section: 'Growth' },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'notifications',
      to: '/technician/notifications',
      section: 'Account',
    },
    { id: 'settings', label: 'Settings', icon: 'settings', to: '/technician/settings', section: 'Account' },
    { id: 'help', label: 'Support', icon: 'help', to: '/technician/help', section: 'Account' },
    { id: 'logout', label: 'Log out', icon: 'logout', action: 'logout', danger: true, section: 'Account' },
  ]
}

export function notificationsPath(role: PortalRole): string {
  if (role === 'customer') return '/customer/notifications'
  if (role === 'technician') return '/technician/notifications'
  return '/admin/notifications'
}

export function loginPath(role: PortalRole): string {
  if (role === 'customer') return '/customer/login'
  if (role === 'technician') return '/technician/login'
  return '/admin/login'
}
