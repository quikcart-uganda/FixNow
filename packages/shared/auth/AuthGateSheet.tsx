import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '@fixnow/ui'
import { ContinueWithGoogleButton } from './ContinueWithGoogleButton'
import {
  clearGuestPendingAction,
  getGuestPendingAction,
  isGuestSession,
  setGuestPendingAction,
  trackGuestEvent,
  type GuestPendingAction,
} from './guestSession'
import { useAuth } from '@fixnow/hooks'
import { marketplaceRolesOf, resolvePostAuthDestination, ROLE_SELECT_PATH } from './roleNavigation'
import { persistRememberedEmail } from './authUx'

type AuthGateState = {
  open: boolean
  title: string
  message: string
  intent: string
  resumePath: string
  payload?: Record<string, unknown>
}

const DEFAULT_TITLE = 'Create your free FixNow account'
const DEFAULT_MESSAGE = 'Sign in or create an account to continue.'

let externalOpen: ((partial: Partial<AuthGateState> & { intent: string }) => void) | null = null

/** Imperative helper for buttons outside React trees that still need the gate. */
export function openAuthGate(input: {
  intent: string
  title?: string
  message?: string
  resumePath?: string
  payload?: Record<string, unknown>
}) {
  externalOpen?.(input)
}

/**
 * Auth continuation sheet for Guest Mode.
 * Preserves intent and resumes after successful login / Google / register.
 */
export function AuthGateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, logout } = useAuth()
  const [state, setState] = useState<AuthGateState>({
    open: false,
    title: DEFAULT_TITLE,
    message: DEFAULT_MESSAGE,
    intent: 'generic',
    resumePath: '/customer/home',
  })
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(
    (partial: Partial<AuthGateState> & { intent: string }) => {
      const resumePath = partial.resumePath || location.pathname
      setGuestPendingAction({
        type: partial.intent,
        path: resumePath,
        intent: partial.intent,
        payload: partial.payload,
      })
      trackGuestEvent('guest_auth_gate_open', { intent: partial.intent, path: resumePath })
      setError(null)
      setState({
        open: true,
        title: partial.title || DEFAULT_TITLE,
        message: partial.message || DEFAULT_MESSAGE,
        intent: partial.intent,
        resumePath,
        payload: partial.payload,
      })
    },
    [location.pathname],
  )

  useEffect(() => {
    externalOpen = open
    return () => {
      externalOpen = null
    }
  }, [open])

  useEffect(() => {
    const st = location.state as { openAuthGate?: boolean; from?: string; authIntent?: string } | null
    if (st?.openAuthGate && isGuestSession() && !isAuthenticated) {
      open({
        intent: st.authIntent || 'protected_route',
        resumePath: st.from || location.pathname,
      })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [isAuthenticated, location.pathname, location.state, navigate, open])

  const close = () => {
    setState((s) => ({ ...s, open: false }))
    trackGuestEvent('guest_auth_gate_dismiss', { intent: state.intent })
  }

  const resumeAfterAuth = (from?: string) => {
    const pending = getGuestPendingAction()
    clearGuestPendingAction()
    const dest = from || pending?.path || state.resumePath || '/customer/home'
    trackGuestEvent('guest_converted', { intent: pending?.intent || state.intent, path: dest })
    navigate(dest, {
      replace: true,
      state: {
        resumeAction: pending?.intent || state.intent,
        resumePayload: pending?.payload || state.payload,
      },
    })
  }

  useEffect(() => {
    if (isAuthenticated && state.open) {
      setState((s) => ({ ...s, open: false }))
    }
  }, [isAuthenticated, state.open])

  return (
    <>
      {children}
      <BottomSheet open={state.open} onClose={close} title={state.title} description={state.message}>
        <div className="space-y-3 pb-2">
          {error ? (
            <p className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error" role="alert">
              {error}
            </p>
          ) : null}

          <ContinueWithGoogleButton
            role="customer"
            rememberMe
            onError={setError}
            onSuccess={async ({ user }) => {
              if (!marketplaceRolesOf(user).includes('customer')) {
                setError('This account does not have a customer profile yet.')
                await logout()
                return
              }
              persistRememberedEmail(user.email, true)
              const dest = resolvePostAuthDestination(user)
              if (dest === ROLE_SELECT_PATH) {
                navigate(ROLE_SELECT_PATH, { replace: true, state: { from: state.resumePath } })
                return
              }
              setState((s) => ({ ...s, open: false }))
              resumeAfterAuth(state.resumePath.startsWith('/customer') ? state.resumePath : dest)
            }}
          />

          <Link
            to="/customer/register"
            state={{ from: state.resumePath, resumeAction: state.intent }}
            onClick={() => setState((s) => ({ ...s, open: false }))}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white"
          >
            Create Account
          </Link>
          <Link
            to="/customer/login"
            state={{ from: state.resumePath, resumeAction: state.intent }}
            onClick={() => setState((s) => ({ ...s, open: false }))}
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-border-subtle bg-surface px-4 text-sm font-bold text-on-surface"
          >
            Sign In
          </Link>
          <button
            type="button"
            onClick={close}
            className="flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-on-surface-variant"
          >
            Not now
          </button>
        </div>
      </BottomSheet>
    </>
  )
}

export function useAuthGate() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  const requireAuth = useCallback(
    (input: {
      intent: string
      title?: string
      message?: string
      resumePath?: string
      payload?: Record<string, unknown>
    }) => {
      if (isAuthenticated) return true
      openAuthGate({
        ...input,
        resumePath: input.resumePath || location.pathname,
      })
      return false
    },
    [isAuthenticated, location.pathname],
  )

  return { requireAuth, isGuest: isGuestSession() && !isAuthenticated }
}

export function consumeResumeAction(): GuestPendingAction | null {
  const pending = getGuestPendingAction()
  if (pending) clearGuestPendingAction()
  return pending
}
