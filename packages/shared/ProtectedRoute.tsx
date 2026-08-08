import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@fixnow/hooks'
import { isCapacitorNative } from '@fixnow/api'
import { isGuestBrowsePath, isGuestProtectedPath, isGuestSession } from './auth/guestSession'

type Role = 'customer' | 'technician' | 'admin'

const HOME: Record<Role, string> = {
  customer: '/customer/home',
  technician: '/technician/dashboard',
  admin: '/admin/dashboard',
}

function homeFor(role: Role): string {
  if (role === 'admin' && isCapacitorNative()) return '/'
  return HOME[role] ?? '/'
}

export function ProtectedRoute({
  children,
  roles,
  loginPath,
  /** When true, active guest sessions may browse allowlisted customer routes. */
  allowGuestBrowse = false,
}: {
  children: ReactNode
  roles?: Role[]
  loginPath: string
  allowGuestBrowse?: boolean
}) {
  const { status, user, isAuthenticated } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
      </div>
    )
  }

  if (isAuthenticated && user) {
    if (roles && !roles.includes(user.role)) {
      return <Navigate to={homeFor(user.role)} replace />
    }
    return <>{children}</>
  }

  // Guest Mode — browse public customer surfaces without JWT.
  if (allowGuestBrowse && isGuestSession() && (!roles || roles.includes('customer'))) {
    if (isGuestProtectedPath(location.pathname)) {
      return (
        <Navigate
          to="/customer/home"
          replace
          state={{ from: location.pathname, openAuthGate: true, authIntent: 'protected_route' }}
        />
      )
    }
    if (isGuestBrowsePath(location.pathname) || location.pathname === '/customer/home') {
      return <>{children}</>
    }
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

export function RoleRedirect({ role, fallback }: { role: Role; fallback: string }) {
  const { status, user, isAuthenticated } = useAuth()
  if (status === 'loading') return null
  if (isAuthenticated && user?.role === role) {
    return <Navigate to={homeFor(role)} replace />
  }
  return <Navigate to={fallback} replace />
}
