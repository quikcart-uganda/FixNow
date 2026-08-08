# FixNow Runtime Stability Audit

## Executive summary

This audit covered the Customer, Technician, and Admin React portals; shared AI,
messaging, notification, tracking, offline, authentication, and startup surfaces;
the frontend API transport; and the backend error-response contract.

The observed failure pattern:

```text
TypeError: (query.data ?? []).map is not a function
```

was caused by nullish fallback being mistaken for runtime shape validation.
`value ?? []` only handles `null` and `undefined`; objects, booleans, and stale
cached envelopes pass through and still crash on `.map()`, `.filter()`,
`.find()`, or `.slice()`.

The fix is implemented at three layers:

1. API collection fields are normalized and contract mismatches are recorded.
2. Untrusted API and cache values are validated before collection operations.
3. Portal and AI feature boundaries replace unexpected render failures with
   friendly retry/refresh states.

## Crashes and failure paths discovered

### 1. Collection operations on non-array API or cached values

Root cause:

- Expressions such as `(query.data ?? []).map(...)` accepted any non-null object.
- API list fields were trusted through TypeScript casts, which provide no runtime
  validation.
- stale mobile/web caches could contain a previous response envelope rather than
  the current list.

Affected surfaces found and hardened:

- Customer: Home, Search, Categories, Offers, Saved Offers, Post Job, My Jobs,
  Job Applications, Help, Payment Methods, Pay Job, and Payment Receipt.
- Technician: Dashboard, Active Jobs, Jobs Feed, Services, Service Areas,
  Registration categories, Reviews, Help, and Marketing.
- Admin: Jobs, Technicians, Locks, Categories, Trust Engine, Content, Reviews,
  Payments/Escrow, Offers Moderation, Platform Promotions, Sponsored Content,
  and Content Blocks.
- Shared: Notifications, Conversations, Chat, AI conversation history, AI
  messages, and splash prefetch.

Resolution:

- Added `safeArray`, `safeObject`, `safeString`, `safeNumber`, `safeBoolean`, and
  `safeItems` in `packages/utils/data.ts`.
- Replaced unvalidated collection operations in audited API-backed render and
  mapping paths.
- Added API transport normalization for known collection fields such as `items`,
  `recent`, `messages`, `notifications`, and `transactions`.
- Malformed successful envelopes now fail as a friendly service error rather
  than passing an invalid value into React.

### 2. Technician marketing dashboard nested-property crash

Root cause:

- `counts`, `totals`, `recent`, `offers`, and `offer.analytics.views` were read as
  guaranteed nested structures.
- A partial dashboard response could crash metrics, sorting, or recent-offer
  rendering.

Resolution:

- The dashboard loader now builds a normalized view model using safe object,
  array, and number coercion.
- Offers list pages validate the collection before rendering.

### 3. AI assistant history and message parsing crash

Root cause:

- Conversation and message `items` were mapped directly.
- Conversation rows, metadata, IDs, titles, and dates were cast without runtime
  validation.

Resolution:

- AI rows are normalized before use.
- The AI panel has its own compact error boundary, so assistant failure cannot
  take down the current portal page.

### 4. Notification action unhandled rejections

Root cause:

- Enable push, mark-all-read, mark-read, and retry-processing actions had promise
  chains without complete rejection handling.

Resolution:

- Each action catches failures, converts them with `getFriendlyErrorMessage`,
  and preserves the loaded notification state.

### 5. Marketing and tracking button unhandled rejections

Root cause:

- Admin duplicate/delete actions and technician pause/resume/arrived tracking
  actions used fire-and-forget promise chains.
- A network, permission, or server error could become an unhandled rejection.

Resolution:

- Added explicit action runners and friendly error state.
- Reloads occur only after successful mutations.
- Tracking session state is updated only after a validated successful response.

### 6. Startup white-screen failure

Root cause:

- Monitoring or native bootstrap rejection escaped from `void start()`.
- Failure before React mounted left no user recovery surface.

Resolution:

- Startup now has a terminal catch and a branded, non-technical retry screen.
- Raw startup diagnostics are logged only in development.
- Missing root markup is handled without a secondary exception.

### 7. Error boundary leaked internal exception text

Root cause:

- The boundary rendered exception name, message, and route in development.
- Section boundaries retained their failed state when users navigated to another
  route.
- Production logging used `console.error` unconditionally.

Resolution:

- No boundary renders exception names, messages, stacks, routes, file paths, or
  component names.
- Detailed diagnostics continue to monitoring and the UI diagnostic endpoint.
- Console details are development-only.
- Section boundaries reset on route changes and provide Try again and Refresh.
- Customer, Technician, Admin, and AI surfaces have isolation boundaries.

### 8. Raw internal errors could escape friendly-message filtering

Root cause:

- `TypeError`, `ReferenceError`, `RangeError`, `SyntaxError`,
  `Cannot read properties`, and `is not a function` were not explicitly treated
  as internal messages.
- Unknown backend exceptions exposed their original message outside production.

Resolution:

- Frontend sanitization now collapses JavaScript runtime diagnostics to a generic
  user-safe message.
- Backend unknown 500 errors always return `Internal server error`.
- Backend 5xx details are never included in HTTP responses; full detail remains
  in logs and monitoring.

### 9. Google namespace type collision and health-response mismatch

Root cause:

- Google Identity and Google Maps declared incompatible global
  `window.google` types.
- Splash health parsing read `circuits` from a union member that did not
  guarantee it.

Resolution:

- Tracking uses a local typed window adapter, allowing Identity and Maps scripts
  to coexist.
- Health data checks property presence before reading circuit state.

## API contract audit

The backend uses the standard success envelope:

```text
{ success: true, message, data, meta? }
```

and failure envelope:

```text
{ success: false, message, data: null, error?, errors? }
```

`sendSuccess`, `sendCreated`, and the centralized error middleware remain the
single response paths. Frontend `apiRequest` now verifies the successful
envelope before returning data. Known collection fields are normalized to
arrays and contract deviations are recorded as `INVALID_RESPONSE_SHAPE`.

This preserves compatibility while preventing `{}`, `null`, or `false` from
reaching array render paths.

## Error boundary coverage

- Application root: startup-independent `AppErrorBoundary`.
- Customer shell: route-scoped `SectionErrorBoundary`.
- Technician shell: route-scoped `SectionErrorBoundary`.
- Admin shell: route-scoped `SectionErrorBoundary`.
- AI assistant: nested `AppErrorBoundary`.

All boundary copy is non-technical. Route changes clear a failed section
boundary, while Try again preserves the surrounding application shell.

## Error recovery and UX

- Read requests retain automatic transient retry and circuit-breaker behavior.
- `useAsync` retains last-known cached data when refresh fails.
- Empty, loading, offline, and service-unavailable states remain distinct.
- Mutation failures preserve form and page state.
- Users receive retry/refresh controls instead of exception output.
- Startup failure provides a direct retry.

## Logging

- Backend: structured server logger and monitoring capture include request ID,
  route, status, code, message, and stack.
- Frontend: monitoring receives exception and component-stack context.
- Client diagnostics record malformed response contracts.
- Browser console exception details are development-only.
- No runtime stack or JavaScript exception text is rendered to users.

## Files modified by this audit

Core stability:

- `packages/utils/data.ts`
- `packages/utils/index.ts`
- `packages/api/client.ts`
- `packages/api/errors.ts`
- `packages/api/index.ts`
- `packages/shared/AppErrorBoundary.tsx`
- `packages/shared/AsyncStateView.tsx` (audited; existing friendly states retained)
- `src/main.tsx`
- `backend/src/middleware/errorHandler.ts`
- `tsconfig.app.json`

Shared features:

- `packages/shared/AiAssistantLauncher.tsx`
- `packages/shared/AiAssistantPanel.tsx`
- `packages/shared/ChatThread.tsx`
- `packages/shared/ConversationInbox.tsx`
- `packages/shared/NotificationsInbox.tsx`
- `packages/shared/auth/ContinueWithGoogleButton.tsx`
- `packages/shared/auth/RoleSelectPage.tsx`
- `packages/shared/auth/devSettings.tsx`
- `packages/shared/MarketingRails.tsx`
- `packages/shared/content/useContentBlocks.ts`
- `packages/shared/location/LocationSettingsCard.tsx`
- `packages/shared/splash/healthCheck.ts`
- `packages/shared/splash/prefetchEssentialContent.ts`
- `packages/shared/tracking/TrackingMap.tsx`
- `packages/native/OfflineBanner.tsx`
- `packages/native/OfflineQueueHost.tsx`

Customer portal:

- `apps/customer/components/CustomerShell.tsx`
- `apps/customer/pages/CategoriesPage.tsx`
- `apps/customer/pages/HelpPage.tsx`
- `apps/customer/pages/HomePage.tsx`
- `apps/customer/pages/JobApplicationsPage.tsx`
- `apps/customer/pages/MyJobsPage.tsx`
- `apps/customer/pages/OffersPage.tsx`
- `apps/customer/pages/PayJobPage.tsx`
- `apps/customer/pages/PaymentMethodsPage.tsx`
- `apps/customer/pages/PaymentReceiptPage.tsx`
- `apps/customer/pages/PostJobPage.tsx`
- `apps/customer/pages/SavedOffersPage.tsx`
- `apps/customer/pages/SearchPage.tsx`

Technician portal:

- `apps/technician/components/layout/AppShell.tsx`
- `apps/technician/pages/ActiveJobsPage.tsx`
- `apps/technician/pages/AchievementsPage.tsx`
- `apps/technician/pages/AssignedJobPage.tsx`
- `apps/technician/pages/DashboardPage.tsx`
- `apps/technician/pages/EarningsPage.tsx`
- `apps/technician/pages/HelpPage.tsx`
- `apps/technician/pages/JobDetailsPage.tsx`
- `apps/technician/pages/JobsFeedPage.tsx`
- `apps/technician/pages/RegisterPage.tsx`
- `apps/technician/pages/ReviewsPage.tsx`
- `apps/technician/pages/ServiceAreasPage.tsx`
- `apps/technician/pages/ServicesPage.tsx`
- `apps/technician/pages/marketing/CreateOfferPage.tsx`
- `apps/technician/pages/marketing/MarketingAnalyticsPage.tsx`
- `apps/technician/pages/marketing/MarketingDashboardPage.tsx`

Admin portal:

- `apps/admin/components/AdminShell.tsx`
- `apps/admin/pages/AcceptInvitePage.tsx`
- `apps/admin/pages/AdminsPage.tsx`
- `apps/admin/pages/CategoriesPage.tsx`
- `apps/admin/pages/ContentPage.tsx`
- `apps/admin/pages/CustomersPage.tsx`
- `apps/admin/pages/DashboardPage.tsx`
- `apps/admin/pages/FreeJobsPage.tsx`
- `apps/admin/pages/JobsPage.tsx`
- `apps/admin/pages/LocksPage.tsx`
- `apps/admin/pages/NotificationsPage.tsx`
- `apps/admin/pages/OffersModerationPage.tsx`
- `apps/admin/pages/PaymentsEscrowPage.tsx`
- `apps/admin/pages/ReviewsModerationPage.tsx`
- `apps/admin/pages/TechniciansPage.tsx`
- `apps/admin/pages/TrackingPage.tsx`
- `apps/admin/pages/TrustEnginePage.tsx`
- `apps/admin/components/admins/AdminDetailDrawer.tsx`
- `apps/admin/pages/marketing/ContentBlocksPage.tsx`
- `apps/admin/pages/marketing/PlatformPromotionsPage.tsx`
- `apps/admin/pages/marketing/SponsoredContentPage.tsx`

## Regression testing

Completed:

- TypeScript project type-check: passed.
- Oxlint: passed with warnings only; no lint errors.
- Unit suite: passed.
- Production Vite build: passed.
- Browser smoke: platform entry, Customer login, Technician login, and Admin
  setup/login entry rendered without raw JavaScript errors.
- Static scan: no remaining `data ?? []` collection operations in portal TSX
  files and no remaining direct `res.data.items ?? []` map pattern.
- Static scan: audited fire-and-forget `.then()` handlers now terminate with
  explicit rejection handling.

Environment limitations:

- Protected Customer, Technician, and Admin routes could not be exhaustively
  clicked in the browser without authenticated seeded role accounts.
- Native Android/iOS device GPS, push permission, background lifecycle, Samsung
  Internet, and iPhone Safari require the physical/device-farm matrix.

The static audit, contract hardening, type-check, unit suite, and production build
cover those code paths, but device/account-specific interactive certification
must use controlled non-production accounts and device fixtures.

## Remaining recommendations

1. Add contract tests for every list endpoint asserting `data.items` is always an
   array, including empty and permission-filtered responses.
2. Add Playwright role fixtures and a route/button crawler for all three portals.
3. Add malformed-payload component tests for `null`, `{}`, `false`, stale
   envelopes, and missing nested objects.
4. Add device-farm runs for Android Chrome, Samsung Internet, iPhone Safari,
   Capacitor Android, and Capacitor iOS.
5. Alert on `INVALID_RESPONSE_SHAPE` diagnostics so backend regressions are fixed
   instead of silently relying on frontend normalization.
