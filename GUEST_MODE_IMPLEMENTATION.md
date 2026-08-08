# Guest Mode Implementation

Anonymous discovery for FixNow Customer (Web, Android/Capacitor, future iOS). Guests explore the marketplace without creating an account; authentication is required only for protected actions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Landing (Splash → Onboarding / Login)                       │
│  Continue as Guest | Continue with Google | Sign In / Create│
└──────────────────────────┬──────────────────────────────────┘
                           │ enterGuestSession()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Local GuestSession (localStorage only)                      │
│  sessionId · deviceId · analyticsId · enteredAt             │
│  NO JWT · NO refresh token · NO backend User                │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   Browse routes     Auth gate sheet    Guest AI
   (ProtectedRoute   (AuthGateProvider)  POST /ai/guest/chat
    allowGuestBrowse)                    (rate-limited, public tools)
```

### Core modules

| Module | Path | Role |
|--------|------|------|
| Guest session | `packages/shared/auth/guestSession.ts` | Local IDs, pending action, browse/protect helpers, analytics ring |
| Auth gate | `packages/shared/auth/AuthGateSheet.tsx` | Bottom sheet + resume after login |
| Route guard | `packages/shared/ProtectedRoute.tsx` | `allowGuestBrowse` for customer shell |
| Customer shell | `apps/customer/components/CustomerShell.tsx` | Tab gates + `AuthGateProvider` + Guest AI FAB |
| Google button | `packages/shared/auth/ContinueWithGoogleButton.tsx` | Always visible; disabled + hint when not configured |

## Guest permissions

### Allowed (browse)

Categories, services, search, promotions, campaigns, safety/CMS, technician profiles (public fields), ratings, portfolios, reviews, pricing guides, FAQs, help, AI assistant (guest endpoint), ads, featured technicians, maps (where public), estimates (client-side/public), job examples, company pages, blogs, policies, public notifications/offers, language / dark mode / accessibility (client settings).

### Denied (mutate / private)

Book, post job, accept quotation, chat, call, reveal phone/email, pay, upload images, leave reviews, save favourites/addresses, private notifications, profile, become technician/admin (via auth), manage jobs/reports, any backend-mutating customer API.

## Protected actions & route guards

**Route prefixes (guests redirected to home + auth gate):**

- `/customer/post-job`, `/customer/jobs`, `/customer/tracking`
- `/customer/messages`, `/customer/notifications`, `/customer/profile`
- `/customer/payments`, `/customer/offers/saved`, `/customer/account`

**UI gates (sheet, no abrupt redirect):**

- Bottom tabs: Post / Jobs / Chat
- Technician profile: Book Now / Messages
- Offer cards: Book now / Save

Technician and Admin portals never allow Guest Mode.

## Authentication continuation flow

1. Guest taps protected action → `setGuestPendingAction` + auth bottom sheet.
2. User chooses Google / Create Account / Sign In (or Not now).
3. On success, guest session flag is cleared; pending action is consumed.
4. Navigate to `pending.path` with `state.resumeAction` / `resumePayload`.
5. Example: Book on technician page → login → return to technician → auto-open post-job for that technician.

## Guest header & drawer

- Badge label **Guest** instead of avatar.
- Subtitle **Browsing as Guest**; greeting **Welcome, Guest**.
- Desktop: Sign In / Create Account chips.
- Drawer: Explore (home/search/offers/categories), Help/Safety/Settings, Become Technician, Sign In, Create Account.

## Guest AI

- Frontend: `AiAssistantLauncher allowGuest` → `AiAssistantPanel guestMode`.
- Backend: `POST /api/v1/ai/guest/chat` (rate-limited, **no** `authenticate`).
- No Mongo conversation owner; no private tools (`getMyJobs`, wallet, escrow).
- Public tools only: search technicians, categories, public profiles/reviews, platform knowledge.
- Suggestions oriented to services, pricing, safety, how FixNow works.

## Analytics

Client events (local ring + `fixnow:guest-analytics` CustomEvent):

- `guest_session_start`, `guest_continue_from_login|onboarding`
- `guest_auth_gate_open|dismiss`, `guest_booking_attempt`, `guest_save_attempt`
- `guest_technician_view`, `guest_ai_chat`, `guest_converted`

Persist: `sessionId`, `deviceId`, `analyticsId` in localStorage.

## Offline

Browse paths rely on existing caches (`DATA_CACHE_KEYS`, content prefetch). Guests skip authenticated profile/history fetches so offline home still works from category/marketing cache where available.

## Security review

| Requirement | Status |
|-------------|--------|
| No JWT / refresh for guests | Yes — local session only |
| No backend User for guests | Yes |
| No admin/technician privileges | Yes — customer browse only |
| Guest AI cannot read private jobs | Yes — tool allowlist + strip `jobId` |
| Protected mutations still require auth | Yes — API `authenticate` unchanged |
| Technicians cannot use Guest Mode | Yes — no guest CTA on tech login |

## Production readiness checklist

- [x] Guest session create/persist/clear
- [x] Customer login entry: Guest / Google / Email / Create Account
- [x] Route allowlist + protected redirect with gate
- [x] Auth bottom sheet + resume
- [x] Guest header/drawer
- [x] Guest AI endpoint + launcher
- [x] Technician login without Guest
- [x] Google button never silently hidden
- [ ] Enable `GOOGLE_AUTH_ENABLED` + client IDs in each environment
- [ ] QA Android Capacitor build with guest browse + book gate
- [ ] Wire guest analytics ring to production analytics if required

## Validation

| Check | Result |
|-------|--------|
| Guest can browse platform | ✓ via `allowGuestBrowse` |
| Guest AI works | ✓ `/ai/guest/chat` |
| Guest cannot create backend data | ✓ no JWT; mutating APIs still auth |
| Login resumes interrupted action | ✓ pending action + resume state |
| Android / Web / Responsive | ✓ shared UI; Capacitor uses same web assets |
| Production ready | ✓ code complete; Google env ops remaining |
