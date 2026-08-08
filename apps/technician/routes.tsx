import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { AppProvider } from '@technician/context/AppContext'
import { AppShell } from '@technician/components/layout/AppShell'

/** Eager entry screens — keep auth/onboarding cold-start lean. */
import { SplashPage } from '@technician/pages/SplashPage'
import { OnboardingPage } from '@technician/pages/OnboardingPage'
import { LoginPage } from '@technician/pages/LoginPage'
import { RegisterPage } from '@technician/pages/RegisterPage'
import { ForgotPasswordPage } from '@technician/pages/ForgotPasswordPage'

function lazyPage<T extends ComponentType<object>>(
  factory: () => Promise<{ [k: string]: T }>,
  exportName: string,
) {
  return lazy(() =>
    factory().then((m) => {
      const Comp = m[exportName]
      if (!Comp) throw new Error(`Missing export ${exportName}`)
      return { default: Comp as ComponentType<object> }
    }),
  )
}

const DashboardPage = lazyPage(() => import('@technician/pages/DashboardPage'), 'DashboardPage')
const ProfessionalDashboardPage = lazyPage(
  () => import('@technician/pages/ProfessionalDashboardPage'),
  'ProfessionalDashboardPage',
)
const BusinessDashboardPage = lazyPage(
  () => import('@technician/pages/BusinessDashboardPage'),
  'BusinessDashboardPage',
)
const MarketingCentrePage = lazyPage(
  () => import('@technician/pages/MarketingCentrePage'),
  'MarketingCentrePage',
)
const CompanyProfilePage = lazyPage(
  () => import('@technician/pages/CompanyProfilePage'),
  'CompanyProfilePage',
)
const TeamPlaceholderPage = lazyPage(
  () => import('@technician/pages/CompanyTeamPlaceholderPage'),
  'TeamPlaceholderPage',
)
const JobsFeedPage = lazyPage(() => import('@technician/pages/JobsFeedPage'), 'JobsFeedPage')
const JobDetailsPage = lazyPage(() => import('@technician/pages/JobDetailsPage'), 'JobDetailsPage')
const ActiveJobsPage = lazyPage(() => import('@technician/pages/ActiveJobsPage'), 'ActiveJobsPage')
const AssignedJobPage = lazyPage(() => import('@technician/pages/AssignedJobPage'), 'AssignedJobPage')
const JobCompletePage = lazyPage(() => import('@technician/pages/JobCompletePage'), 'JobCompletePage')
const PortfolioPage = lazyPage(() => import('@technician/pages/PortfolioPage'), 'PortfolioPage')
const ReviewsPage = lazyPage(() => import('@technician/pages/ReviewsPage'), 'ReviewsPage')
const EarningsPage = lazyPage(() => import('@technician/pages/EarningsPage'), 'EarningsPage')
const LockedPage = lazyPage(() => import('@technician/pages/LockedPage'), 'LockedPage')
const UpgradePage = lazyPage(() => import('@technician/pages/UpgradePage'), 'UpgradePage')
const PlanDetailPage = lazyPage(() => import('@technician/pages/PlanDetailPage'), 'PlanDetailPage')
const SubscriptionBillingPage = lazyPage(
  () => import('@technician/pages/SubscriptionBillingPage'),
  'SubscriptionBillingPage',
)
const SubscriptionCentrePage = lazyPage(
  () => import('@technician/pages/SubscriptionCentrePage'),
  'SubscriptionCentrePage',
)
const BoostMarketplacePage = lazyPage(
  () => import('@technician/pages/BoostMarketplacePage'),
  'BoostMarketplacePage',
)
const NotificationsPage = lazyPage(
  () => import('@technician/pages/NotificationsPage'),
  'NotificationsPage',
)
const MessagesPage = lazyPage(() => import('@technician/pages/MessagesPage'), 'MessagesPage')
const ChatPage = lazyPage(() => import('@technician/pages/ChatPage'), 'ChatPage')
const ProfilePage = lazyPage(() => import('@technician/pages/ProfilePage'), 'ProfilePage')
const ProfileSetupPage = lazyPage(() => import('@technician/pages/ProfileSetupPage'), 'ProfileSetupPage')
const SettingsPage = lazyPage(() => import('@technician/pages/SettingsPage'), 'SettingsPage')
const AvailabilityPage = lazyPage(
  () => import('@technician/pages/AvailabilityPage'),
  'AvailabilityPage',
)
const ServiceAreasPage = lazyPage(
  () => import('@technician/pages/ServiceAreasPage'),
  'ServiceAreasPage',
)
const ServicesPage = lazyPage(() => import('@technician/pages/ServicesPage'), 'ServicesPage')
const ReputationPage = lazyPage(() => import('@technician/pages/ReputationPage'), 'ReputationPage')
const AchievementsPage = lazyPage(
  () => import('@technician/pages/AchievementsPage'),
  'AchievementsPage',
)
const CommunityPage = lazyPage(() => import('@technician/pages/CommunityPage'), 'CommunityPage')
const ReferralsPage = lazyPage(() => import('@technician/pages/ReferralsPage'), 'ReferralsPage')
const GuaranteePage = lazyPage(() => import('@technician/pages/GuaranteePage'), 'GuaranteePage')
const HelpPage = lazyPage(() => import('@technician/pages/HelpPage'), 'HelpPage')
const PrivacyPage = lazyPage(() => import('@technician/pages/PrivacyPage'), 'PrivacyPage')
const ContentDocumentPage = lazyPage(
  () => import('@technician/pages/ContentDocumentPage'),
  'ContentDocumentPage',
)
const DeleteAccountPage = lazyPage(
  () => import('@technician/pages/DeleteAccountPage'),
  'DeleteAccountPage',
)
const MarketingLayout = lazyPage(
  () => import('@technician/pages/marketing/MarketingLayout'),
  'MarketingLayout',
)
const MarketingDashboardPage = lazy(() =>
  import('@technician/pages/marketing/MarketingDashboardPage').then((m) => ({
    default: m.MarketingDashboardPage,
  })),
)
const MarketingOffersListPage = lazy(() =>
  import('@technician/pages/marketing/MarketingDashboardPage').then((m) => ({
    default: m.MarketingOffersListPage,
  })),
)
const CreateOfferPage = lazyPage(
  () => import('@technician/pages/marketing/CreateOfferPage'),
  'CreateOfferPage',
)
const MarketingAnalyticsPage = lazyPage(
  () => import('@technician/pages/marketing/MarketingAnalyticsPage'),
  'MarketingAnalyticsPage',
)
const MarketingCreativesPage = lazyPage(
  () => import('@technician/pages/marketing/MarketingCreativesPage'),
  'MarketingCreativesPage',
)

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
    </div>
  )
}

function Suspend({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, isAuthenticated, hasRole } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
      </div>
    )
  }

  if (!isAuthenticated || !hasRole('technician')) {
    return <Navigate to="/technician/login" replace state={{ from: location.pathname }} />
  }

  return children
}

function TechnicianRoutes() {
  return (
    <Suspend>
      <Routes>
        <Route index element={<SplashPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="content/:slug" element={<ContentDocumentPage />} />
        <Route path="legal/:slug" element={<ContentDocumentPage />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="professional" element={<ProfessionalDashboardPage />} />
          <Route path="business" element={<BusinessDashboardPage />} />
          <Route path="business/marketing-centre" element={<MarketingCentrePage />} />
          <Route path="business/company" element={<CompanyProfilePage />} />
          <Route path="business/team" element={<TeamPlaceholderPage />} />
          <Route path="jobs" element={<JobsFeedPage />} />
          <Route path="jobs/:id" element={<JobDetailsPage />} />
          <Route path="active" element={<ActiveJobsPage />} />
          <Route path="active/:id" element={<AssignedJobPage />} />
          <Route path="complete/:id" element={<JobCompletePage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="earnings" element={<EarningsPage />} />
          <Route path="locked" element={<LockedPage />} />
          <Route path="upgrade" element={<UpgradePage />} />
          <Route path="plans" element={<UpgradePage />} />
          <Route path="plans/:code" element={<PlanDetailPage />} />
          <Route path="subscription" element={<SubscriptionCentrePage />} />
          <Route path="boosts" element={<BoostMarketplacePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:id" element={<ChatPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile-setup" element={<ProfileSetupPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/billing" element={<SubscriptionBillingPage />} />
          <Route path="settings/privacy" element={<PrivacyPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="service-areas" element={<ServiceAreasPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="reputation" element={<ReputationPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="community/:id" element={<CommunityPage />} />
          <Route path="referrals" element={<ReferralsPage />} />
          <Route path="marketing" element={<MarketingLayout />}>
            <Route index element={<MarketingDashboardPage />} />
            <Route path="creatives" element={<MarketingCreativesPage />} />
            <Route path="offers" element={<MarketingOffersListPage title="My offers" />} />
            <Route path="create" element={<CreateOfferPage />} />
            <Route path="drafts" element={<MarketingOffersListPage lifecycle="draft" title="Drafts" />} />
            <Route
              path="pending"
              element={<MarketingOffersListPage lifecycle="pending" title="Pending approval" />}
            />
            <Route
              path="scheduled"
              element={<MarketingOffersListPage lifecycle="scheduled" title="Scheduled" />}
            />
            <Route path="active" element={<MarketingOffersListPage lifecycle="active" title="Active" />} />
            <Route
              path="expired"
              element={<MarketingOffersListPage lifecycle="expired" title="Expired" />}
            />
            <Route
              path="rejected"
              element={<MarketingOffersListPage lifecycle="rejected" title="Rejected" />}
            />
            <Route path="analytics" element={<MarketingAnalyticsPage />} />
          </Route>
          <Route path="guarantee" element={<GuaranteePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="account/delete" element={<DeleteAccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/technician" replace />} />
      </Routes>
    </Suspend>
  )
}

export default function TechnicianApp() {
  // Technician-scoped profile/onboarding context for the whole portal —
  // including splash, onboarding, and register (they call useApp).
  // AppProvider already no-ops profile fetches until technician auth is present.
  return (
    <AppProvider>
      <TechnicianRoutes />
    </AppProvider>
  )
}
