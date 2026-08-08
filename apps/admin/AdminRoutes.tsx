import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@fixnow/shared'
import { AdminShell } from './components/AdminShell'
import { AdminLoginPage } from './pages/LoginPage'

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

const AdminDashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'AdminDashboardPage')
const TechniciansPage = lazyPage(() => import('./pages/TechniciansPage'), 'TechniciansPage')
const CustomersPage = lazyPage(() => import('./pages/CustomersPage'), 'CustomersPage')
const JobsPage = lazyPage(() => import('./pages/JobsPage'), 'JobsPage')
const VerificationPage = lazyPage(() => import('./pages/VerificationPage'), 'VerificationPage')
const FreeJobsPage = lazyPage(() => import('./pages/FreeJobsPage'), 'FreeJobsPage')
const LocksPage = lazyPage(() => import('./pages/LocksPage'), 'LocksPage')
const CategoriesPage = lazyPage(() => import('./pages/CategoriesPage'), 'CategoriesPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage')
const NotificationsPage = lazyPage(() => import('./pages/NotificationsPage'), 'NotificationsPage')
const ContentPage = lazyPage(() => import('./pages/ContentPage'), 'ContentPage')
const AuditPage = lazyPage(() => import('./pages/AuditPage'), 'AuditPage')
const SubscriptionsPage = lazyPage(() => import('./pages/SubscriptionsPage'), 'SubscriptionsPage')
const BoostsPage = lazyPage(() => import('./pages/BoostsPage'), 'BoostsPage')
const RecommendationEnginePage = lazyPage(
  () => import('./pages/RecommendationEnginePage'),
  'RecommendationEnginePage',
)
const TrustEnginePage = lazyPage(() => import('./pages/TrustEnginePage'), 'TrustEnginePage')
const ReviewsModerationPage = lazyPage(
  () => import('./pages/ReviewsModerationPage'),
  'ReviewsModerationPage',
)
const AdminMessagesPage = lazyPage(() => import('./pages/MessagesPage'), 'AdminMessagesPage')
const PaymentsEscrowPage = lazyPage(() => import('./pages/PaymentsEscrowPage'), 'PaymentsEscrowPage')
const TrackingPage = lazyPage(() => import('./pages/TrackingPage'), 'TrackingPage')
const PortalModerationPage = lazyPage(() => import('./pages/PortalModerationPage'), 'PortalModerationPage')
const DevelopmentControlsPage = lazyPage(
  () => import('./pages/DevelopmentControlsPage'),
  'DevelopmentControlsPage',
)
const DevelopmentAccessPage = lazyPage(
  () => import('./pages/DevelopmentAccessPage'),
  'DevelopmentAccessPage',
)
const SandboxManagementPage = lazyPage(
  () => import('./pages/SandboxManagementPage'),
  'SandboxManagementPage',
)
const SeedPlatformPage = lazyPage(() => import('./pages/SeedPlatformPage'), 'SeedPlatformPage')
const DeveloperPreviewPage = lazyPage(
  () => import('./pages/DeveloperPreviewPage'),
  'DeveloperPreviewPage',
)
const ProductionGovernancePage = lazyPage(
  () => import('./pages/ProductionGovernancePage'),
  'ProductionGovernancePage',
)
const ProductionOwnerPage = lazyPage(
  () => import('./pages/ProductionOwnerPage'),
  'ProductionOwnerPage',
)
const LaunchCentrePage = lazyPage(() => import('./pages/LaunchCentrePage'), 'LaunchCentrePage')
const ProvidersPage = lazyPage(() => import('./pages/ProvidersPage'), 'ProvidersPage')
const LocationServicesPage = lazyPage(
  () => import('./pages/LocationServicesPage'),
  'LocationServicesPage',
)
const RealtimeDiagnosticsPage = lazyPage(
  () => import('./pages/RealtimeDiagnosticsPage'),
  'RealtimeDiagnosticsPage',
)
const AdminsPage = lazyPage(() => import('./pages/AdminsPage'), 'AdminsPage')
const AcceptInvitePage = lazyPage(() => import('./pages/AcceptInvitePage'), 'AcceptInvitePage')
const AdminSetupPage = lazyPage(() => import('./pages/SetupPage'), 'AdminSetupPage')
const AdminDevEntryPage = lazyPage(() => import('./pages/DevEntryPage'), 'AdminDevEntryPage')
const AdminForgotPasswordPage = lazyPage(
  () => import('./pages/ForgotPasswordPage'),
  'AdminForgotPasswordPage',
)

const MarketingLayout = lazyPage(() => import('./pages/marketing/MarketingLayout'), 'MarketingLayout')
const MarketingAnalyticsPage = lazyPage(
  () => import('./pages/marketing/MarketingAnalyticsPage'),
  'MarketingAnalyticsPage',
)
const PendingOffersPage = lazyPage(() => import('./pages/marketing/OfferQueuePages'), 'PendingOffersPage')
const ApprovedOffersPage = lazyPage(() => import('./pages/marketing/OfferQueuePages'), 'ApprovedOffersPage')
const RejectedOffersPage = lazyPage(() => import('./pages/marketing/OfferQueuePages'), 'RejectedOffersPage')
const PlatformPromotionsPage = lazyPage(
  () => import('./pages/marketing/PlatformPromotionsPage'),
  'PlatformPromotionsPage',
)
const SponsoredContentPage = lazyPage(
  () => import('./pages/marketing/SponsoredContentPage'),
  'SponsoredContentPage',
)
const BannerManagementPage = lazyPage(
  () => import('./pages/marketing/BannerManagementPage'),
  'BannerManagementPage',
)
const AdvertisementsPage = lazyPage(
  () => import('./pages/marketing/SponsoredContentPage'),
  'AdvertisementsPage',
)
const MarketingCategoriesPage = lazyPage(
  () => import('./pages/marketing/MarketingCategoriesPage'),
  'MarketingCategoriesPage',
)
const ContentBlocksPage = lazyPage(
  () => import('./pages/marketing/ContentBlocksPage'),
  'ContentBlocksPage',
)
const DynamicPricingPage = lazyPage(
  () => import('./pages/marketing/DynamicPricingPage'),
  'DynamicPricingPage',
)

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
    </div>
  )
}

function Suspend({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

export function AdminRoutes() {
  return (
    <div className="admin-theme min-h-dvh">
      <Routes>
        <Route path="login" element={<AdminLoginPage />} />
        <Route path="setup" element={<Suspend><AdminSetupPage /></Suspend>} />
        <Route path="dev" element={<Suspend><AdminDevEntryPage /></Suspend>} />
        <Route path="accept-invite" element={<Suspend><AcceptInvitePage /></Suspend>} />
        <Route
          path="forgot-password"
          element={
            <Suspend>
              <AdminForgotPasswordPage />
            </Suspend>
          }
        />
        <Route path="production-owner" element={<Suspend><ProductionOwnerPage /></Suspend>} />
        <Route
          element={
            <ProtectedRoute roles={['admin']} loginPath="/admin/login">
              <Suspend>
                <AdminShell />
              </Suspend>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="technicians" element={<TechniciansPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="verification" element={<VerificationPage />} />
          <Route path="portal" element={<PortalModerationPage />} />
          <Route path="free-jobs" element={<FreeJobsPage />} />
          <Route path="locks" element={<LocksPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<Navigate to="/admin/settings/providers" replace />} />
          <Route path="settings/providers" element={<ProvidersPage />} />
          <Route path="location" element={<LocationServicesPage />} />
          <Route path="settings/realtime" element={<RealtimeDiagnosticsPage />} />
          <Route path="settings/development" element={<DevelopmentControlsPage />} />
          <Route path="settings/development-access" element={<DevelopmentAccessPage />} />
          <Route path="settings/sandbox" element={<SandboxManagementPage />} />
          <Route path="settings/seed-platform" element={<SeedPlatformPage />} />
          <Route path="settings/developer-preview" element={<DeveloperPreviewPage />} />
          <Route path="settings/governance" element={<ProductionGovernancePage />} />
          <Route path="settings/launch-centre" element={<LaunchCentrePage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="boosts" element={<BoostsPage />} />
          <Route path="recommendations" element={<RecommendationEnginePage />} />
          <Route path="trust" element={<TrustEnginePage />} />
          <Route path="reviews" element={<ReviewsModerationPage />} />
          <Route path="offers" element={<Navigate to="/admin/marketing/pending" replace />} />
          <Route path="marketing" element={<MarketingLayout />}>
            <Route index element={<MarketingAnalyticsPage />} />
            <Route path="pending" element={<PendingOffersPage />} />
            <Route path="approved" element={<ApprovedOffersPage />} />
            <Route path="rejected" element={<RejectedOffersPage />} />
            <Route path="platform" element={<PlatformPromotionsPage />} />
            <Route path="banners" element={<BannerManagementPage />} />
            <Route path="campaigns" element={<SponsoredContentPage />} />
            <Route path="ads" element={<AdvertisementsPage />} />
            <Route path="content-blocks" element={<ContentBlocksPage />} />
            <Route path="pricing" element={<DynamicPricingPage />} />
            <Route path="categories" element={<MarketingCategoriesPage />} />
            <Route path="analytics" element={<MarketingAnalyticsPage />} />
          </Route>
          <Route path="payments" element={<PaymentsEscrowPage />} />
          <Route path="messages" element={<AdminMessagesPage />} />
          <Route path="messages/:id" element={<AdminMessagesPage />} />
        </Route>
        {/* Absolute target — relative "dashboard" can self-redirect-loop if splat matching fails. */}
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </div>
  )
}
