import type { ReactNode } from 'react'

export type PortalRole = 'customer' | 'technician' | 'admin'

export type HeaderMenuItem = {
  id: string
  label: string
  icon: string
  to?: string
  description?: string
  danger?: boolean
  action?: 'logout' | 'status' | 'coming_soon' | 'auth_gate'
  /** Optional group heading for drawer sections */
  section?: string
}

export type PortalHeaderProps = {
  role: PortalRole
  brand?: string
  subtitle?: string
  /** Left-side menu (hamburger). When provided, menu opens a nav sheet. */
  showMenu?: boolean
  /** Extra nav links for the hamburger sheet (in addition to profile menu). */
  navItems?: HeaderMenuItem[]
  /** Avatar photo URL */
  photoUrl?: string | null
  /** Display name for avatar / menu */
  displayName?: string
  /** Anonymous guest discovery session — no JWT / profile avatar */
  guestMode?: boolean
  /** Technician availability status label */
  availabilityStatus?: 'available' | 'busy' | 'offline' | 'on_job' | null
  /** Receives successful technician availability changes. */
  onAvailabilityChange?: (status: 'available' | 'busy' | 'offline' | 'on_job') => void
  /** Hide notification bell */
  hideNotifications?: boolean
  /** Hide live/status chip (e.g. when shell already shows one) */
  hideStatus?: boolean
  /** Custom left slot (replaces brand when set with showMenu) */
  leftSlot?: ReactNode
  className?: string
  /** Compact sticky bar styling variant */
  variant?: 'default' | 'admin' | 'technician'
}
