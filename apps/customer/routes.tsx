import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@fixnow/shared'
import { CustomerShell } from '@customer/components/CustomerShell'

/** Eager entry screens — cold-start path must stay small. */
import { SplashPage } from '@customer/pages/SplashPage'
import { OnboardingPage } from '@customer/pages/OnboardingPage'
import { LoginPage } from '@customer/pages/LoginPage'
import { RegisterPage } from '@customer/pages/RegisterPage'
import { ForgotPasswordPage } from '@customer/pages/ForgotPasswordPage'

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

const HomePage = lazyPage(() => import('@customer/pages/HomePage'), 'HomePage')
const CategoriesPage = lazyPage(() => import('@customer/pages/CategoriesPage'), 'CategoriesPage')
const SearchPage = lazyPage(() => import('@customer/pages/SearchPage'), 'SearchPage')
const TechnicianProfilePage = lazyPage(
  () => import('@customer/pages/TechnicianProfilePage'),
  'TechnicianProfilePage',
)
const PostJobPage = lazyPage(() => import('@customer/pages/PostJobPage'), 'PostJobPage')
const JobTrackingPage = lazyPage(() => import('@customer/pages/JobTrackingPage'), 'JobTrackingPage')
const ProfileSettingsPage = lazyPage(
  () => import('@customer/pages/ProfileSettingsPage'),
  'ProfileSettingsPage',
)
const HelpPage = lazyPage(() => import('@customer/pages/HelpPage'), 'HelpPage')
const ContentDocumentPage = lazyPage(
  () => import('@customer/pages/ContentDocumentPage'),
  'ContentDocumentPage',
)
const DeleteAccountPage = lazyPage(
  () => import('@customer/pages/DeleteAccountPage'),
  'DeleteAccountPage',
)
const MyJobsPage = lazyPage(() => import('@customer/pages/MyJobsPage'), 'MyJobsPage')
const JobApplicationsPage = lazyPage(
  () => import('@customer/pages/JobApplicationsPage'),
  'JobApplicationsPage',
)
const MessagesPage = lazyPage(() => import('@customer/pages/MessagesPage'), 'MessagesPage')
const ChatPage = lazyPage(() => import('@customer/pages/ChatPage'), 'ChatPage')
const NotificationsPage = lazyPage(
  () => import('@customer/pages/NotificationsPage'),
  'NotificationsPage',
)
const OffersPage = lazyPage(() => import('@customer/pages/OffersPage'), 'OffersPage')
const OfferDetailPage = lazyPage(() => import('@customer/pages/OfferDetailPage'), 'OfferDetailPage')
const SavedOffersPage = lazyPage(() => import('@customer/pages/SavedOffersPage'), 'SavedOffersPage')
const PaymentMethodsPage = lazyPage(
  () => import('@customer/pages/PaymentMethodsPage'),
  'PaymentMethodsPage',
)
const PayJobPage = lazyPage(() => import('@customer/pages/PayJobPage'), 'PayJobPage')
const PaymentSuccessPage = lazyPage(
  () => import('@customer/pages/PaymentSuccessPage'),
  'PaymentSuccessPage',
)
const PaymentReceiptPage = lazyPage(
  () => import('@customer/pages/PaymentReceiptPage'),
  'PaymentReceiptPage',
)

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-70" />
    </div>
  )
}

function Suspend({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

export default function CustomerApp() {
  return (
    <div className="customer-theme min-h-dvh bg-background text-on-surface">
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
              <ProtectedRoute roles={['customer']} loginPath="/customer/login" allowGuestBrowse>
                <CustomerShell />
              </ProtectedRoute>
            }
          >
            <Route path="home" element={<HomePage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="offers/saved" element={<SavedOffersPage />} />
            <Route path="offers/:id" element={<OfferDetailPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="technician/:id" element={<TechnicianProfilePage />} />
            <Route path="post-job" element={<PostJobPage />} />
            <Route path="jobs" element={<MyJobsPage />} />
            <Route path="jobs/:id/applications" element={<JobApplicationsPage />} />
            <Route path="tracking" element={<JobTrackingPage />} />
            <Route path="tracking/:id" element={<JobTrackingPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:id" element={<ChatPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfileSettingsPage />} />
            <Route path="payments" element={<PaymentMethodsPage />} />
            <Route path="payments/pay/:id" element={<PayJobPage />} />
            <Route path="payments/success" element={<PaymentSuccessPage />} />
            <Route path="payments/receipt/:id" element={<PaymentReceiptPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="account/delete" element={<DeleteAccountPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/customer" replace />} />
        </Routes>
      </Suspend>
    </div>
  )
}
