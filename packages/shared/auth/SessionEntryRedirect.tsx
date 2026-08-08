import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { isCapacitorNative } from '@fixnow/api'
import {
  homePathForRole,
  marketplaceRolesOf,
  resolveResumeRole,
  ROLE_SELECT_PATH,
} from './roleNavigation'

/**
 * Sends an authenticated user from `/` into the correct marketplace experience,
 * activating the remembered role when needed (no re-login).
 */
export function SessionEntryRedirect() {
  const navigate = useNavigate()
  const { user, switchRole, logout } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ranForUser = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      ranForUser.current = null
      return
    }
    // Prevent re-entry loops when user object identity changes after switchRole.
    if (ranForUser.current === user.id) return
    ranForUser.current = user.id

    let cancelled = false
    void (async () => {
      if (user.role === 'admin') {
        if (isCapacitorNative()) {
          // Admin is web-only — do not bounce navigate('/') while already on `/`.
          await logout()
          if (!cancelled) navigate('/', { replace: true })
          return
        }
        navigate('/admin/dashboard', { replace: true })
        return
      }

      const roles = marketplaceRolesOf(user)
      if (roles.length === 0) {
        await logout()
        if (!cancelled) navigate('/', { replace: true })
        return
      }

      const resume = resolveResumeRole(user)
      if (!resume) {
        navigate(ROLE_SELECT_PATH, { replace: true })
        return
      }
      try {
        if (user.role !== resume) {
          await switchRole(resume)
        }
        if (!cancelled) navigate(homePathForRole(resume), { replace: true })
      } catch {
        if (!cancelled) {
          setError('We could not restore your last role.')
          ranForUser.current = null
          navigate(ROLE_SELECT_PATH, { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, switchRole, navigate, logout])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" role="status" aria-label="Opening FixNow">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
      {error ? <p className="text-sm text-on-surface-variant">{error}</p> : null}
    </div>
  )
}
