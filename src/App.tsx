import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isNativePlatform } from '@fixnow/native'
import { RoleSelectPage, SessionEntryRedirect } from '@fixnow/shared'
import { PlatformLanding } from './PlatformLanding'
import { useAuth } from '@fixnow/hooks'

// Customer + Technician always available. Admin is web-only (never mounted on Capacitor).
const CustomerApp = lazy(() => import('@customer/routes'))
const TechnicianApp = lazy(() => import('@technician/routes'))
const AdminRoutes = lazy(() =>
  import('@admin/AdminRoutes').then((m) => ({ default: m.AdminRoutes })),
)

function PortalFallback() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      style={{ background: 'linear-gradient(145deg, #002a74 0%, #004ac6 44%, #2563eb 82%)' }}
      role="status"
      aria-label="Loading FixNow"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-white opacity-80" />
    </div>
  )
}

/**
 * Admin portal is intentionally unavailable inside the Capacitor Android/iOS shell.
 * Keep this gate as the route `element` (not an extra nested router) so `/admin/*`
 * splat matching continues to apply to AdminRoutes the same way Customer/Technician do.
 */
function AdminPortalGate() {
  if (isNativePlatform()) {
    return <Navigate to="/" replace />
  }
  return <AdminRoutes />
}

function RootEntry() {
  const { status, isAuthenticated, user } = useAuth()
  if (status === 'loading') return <PortalFallback />
  if (isAuthenticated && user) return <SessionEntryRedirect />
  return <PlatformLanding />
}

export default function App() {
  return (
    <Suspense fallback={<PortalFallback />}>
      <Routes>
        <Route path="/" element={<RootEntry />} />
        <Route path="/select-role" element={<RoleSelectPage />} />
        <Route path="/customer/*" element={<CustomerApp />} />
        <Route path="/technician/*" element={<TechnicianApp />} />
        <Route path="/admin/*" element={<AdminPortalGate />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
