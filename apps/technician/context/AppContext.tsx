import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { technicianApi, mapTechnicianProfile, getFriendlyErrorMessage } from '@fixnow/api'
import { useAuth, useSocketEvent, SOCKET_EVENTS } from '@fixnow/hooks'
import type { AccountStatus, JobStatus, TechnicianProfile } from '@fixnow/types'

const emptyProfile: TechnicianProfile = {
  id: '',
  name: '',
  phone: '',
  email: '',
  photo: '',
  category: 'General',
  subcategories: [],
  experienceYears: 0,
  skills: [],
  certifications: [],
  serviceAreas: [],
  parish: '—',
  district: 'Kampala',
  level: 'New Professional',
  trust: { trust: 0, reliability: 0, completion: 0, response: 0, punctuality: 0 },
  badges: [],
  rating: 0,
  reviewCount: 0,
  jobsWon: 0,
  jobsCompleted: 0,
  freeJobsUsed: 0,
  freeJobLimit: 20,
  accountStatus: 'active',
  responseRate: 0,
  completionRate: 0,
  repeatCustomerPct: 0,
  earningsWeek: 0,
  mobileMoney: '',
  mobileMoneyName: '',
  availability: 'Unavailable',
  workingHours: '',
  bio: '',
  points: 0,
  nextLevel: 'Active',
  nextLevelProgress: 0,
}

interface AppState {
  profile: TechnicianProfile
  profileLoading: boolean
  profileError: string | null
  refreshProfile: () => Promise<void>
  onboarded: boolean
  registered: boolean
  setOnboarded: (v: boolean) => void
  setRegistered: (v: boolean) => void
  updateProfile: (patch: Partial<TechnicianProfile>) => void
  isLocked: boolean
  remainingFreeJobs: number
  canApply: boolean
  /** Server quota SSOT — prefer over profile.subscriptionStatus string checks. */
  hasActiveSubscription: boolean
  /** True once quota gate has been fetched (avoids flashing wrong plan labels). */
  subscriptionReady: boolean
  /** Effective plan from entitlement engine (includes Developer Preview). */
  entitlementPlanCode: string | null
  subscriptionSource: 'production' | 'developer_preview' | string
  previewActive: boolean
  jobStatuses: Record<string, JobStatus>
  setJobStatus: (id: string, status: JobStatus) => void
  skippedJobs: string[]
  skipJob: (id: string) => void
  appliedJobs: string[]
  applyToJob: (id: string) => boolean
  markApplied: (id: string) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, hasRole, user } = useAuth()
  const [profile, setProfile] = useState<TechnicianProfile>(emptyProfile)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('fn_tech_onboarded') === '1')
  const [skippedJobs, setSkippedJobs] = useState<string[]>([])
  const [appliedJobs, setAppliedJobs] = useState<string[]>([])
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({})
  /** Server-authoritative apply gate from /technicians/me/quota (entitlement + free-job SSOT). */
  const [quotaGate, setQuotaGate] = useState<{
    canApply: boolean
    remainingFreeJobs: number
    hasActiveSubscription: boolean
    planCode?: string | null
    subscriptionSource?: string
    preview?: unknown
  } | null>(null)

  const registered = isAuthenticated && hasRole('technician')

  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated || !hasRole('technician')) return
    setProfileLoading(true)
    setProfileError(null)
    try {
      const [res, quotaRes] = await Promise.all([
        technicianApi.getProfile(),
        technicianApi.getQuota().catch(() => null),
      ])
      setProfile(
        mapTechnicianProfile({
          user: res.data.user,
          profile: res.data.profile,
          trust: res.data.trust,
        }),
      )
      if (quotaRes?.data?.quota) {
        const q = quotaRes.data.quota as Record<string, unknown>
        setQuotaGate({
          canApply: Boolean(q.canApply),
          remainingFreeJobs: Math.max(0, Number(q.remainingFreeCompletedJobs ?? q.remainingFreeJobs ?? 0)),
          hasActiveSubscription: Boolean(q.hasActiveSubscription),
          planCode: q.subscriptionPlan != null ? String(q.subscriptionPlan) : null,
          subscriptionSource: q.subscriptionSource != null ? String(q.subscriptionSource) : 'production',
          preview: q.preview ?? null,
        })
      }
    } catch (err) {
      setProfileError(getFriendlyErrorMessage(err))
    } finally {
      setProfileLoading(false)
    }
  }, [isAuthenticated, hasRole])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile, user?.id])

  const isTechnician = isAuthenticated && hasRole('technician')
  useSocketEvent(
    [
      SOCKET_EVENTS.TECHNICIAN_LOCKED,
      SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
      SOCKET_EVENTS.TRUST_SCORE_UPDATED,
      SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
      SOCKET_EVENTS.AVAILABILITY_CHANGED,
      SOCKET_EVENTS.REPUTATION_UPDATED,
      SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
      SOCKET_EVENTS.SUBSCRIPTION_CATALOGUE_UPDATED,
    ],
    () => {
      void refreshProfile()
    },
    isTechnician,
  )

  // Prefer server quota (grace-aware paid access). Fall back only while quota loads.
  const remainingFreeJobs =
    quotaGate?.remainingFreeJobs ?? Math.max(0, profile.freeJobLimit - profile.freeJobsUsed)
  const subscriptionReady = quotaGate != null
  const hasActiveSubscription = quotaGate?.hasActiveSubscription ?? false
  const entitlementPlanCode =
    quotaGate?.planCode || profile.subscriptionPlanCode || null
  const subscriptionSource = quotaGate?.subscriptionSource || 'production'
  const previewActive = Boolean(quotaGate?.preview) || subscriptionSource === 'developer_preview'
  const isLocked =
    quotaGate != null
      ? !quotaGate.canApply && !quotaGate.hasActiveSubscription
      : !hasActiveSubscription && (profile.accountStatus === 'locked' || remainingFreeJobs <= 0)
  const canApply = quotaGate != null ? quotaGate.canApply : !isLocked || hasActiveSubscription

  const updateProfile = useCallback((patch: Partial<TechnicianProfile>) => {
    setProfile((p) => {
      const next = { ...p, ...patch }
      const used = next.freeJobsUsed
      const limit = next.freeJobLimit
      const status: AccountStatus =
        used >= limit
          ? 'locked'
          : next.accountStatus === 'locked' && used < limit
            ? 'active'
            : next.accountStatus
      return { ...next, accountStatus: status }
    })
  }, [])

  const setJobStatus = useCallback((id: string, status: JobStatus) => {
    setJobStatuses((s) => ({ ...s, [id]: status }))
  }, [])

  const skipJob = useCallback((id: string) => {
    setSkippedJobs((s) => (s.includes(id) ? s : [...s, id]))
  }, [])

  const markApplied = useCallback((id: string) => {
    setAppliedJobs((s) => (s.includes(id) ? s : [...s, id]))
  }, [])

  const applyToJob = useCallback(
    (id: string) => {
      if (!canApply) return false
      markApplied(id)
      return true
    },
    [canApply, markApplied],
  )

  const setOnboardedPersist = useCallback((v: boolean) => {
    setOnboarded(v)
    localStorage.setItem('fn_tech_onboarded', v ? '1' : '0')
  }, [])

  const value = useMemo(
    () => ({
      profile,
      profileLoading,
      profileError,
      refreshProfile,
      onboarded,
      registered,
      setOnboarded: setOnboardedPersist,
      setRegistered: () => undefined,
      updateProfile,
      isLocked,
      remainingFreeJobs,
      canApply,
      hasActiveSubscription,
      subscriptionReady,
      entitlementPlanCode,
      subscriptionSource,
      previewActive,
      jobStatuses,
      setJobStatus,
      skippedJobs,
      skipJob,
      appliedJobs,
      applyToJob,
      markApplied,
    }),
    [
      profile,
      profileLoading,
      profileError,
      refreshProfile,
      onboarded,
      registered,
      setOnboardedPersist,
      hasActiveSubscription,
      subscriptionReady,
      entitlementPlanCode,
      subscriptionSource,
      previewActive,
      updateProfile,
      isLocked,
      remainingFreeJobs,
      canApply,
      jobStatuses,
      setJobStatus,
      skippedJobs,
      skipJob,
      appliedJobs,
      applyToJob,
      markApplied,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
