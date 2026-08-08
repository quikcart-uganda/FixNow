# Authentication Entry & Google Sign-In Restore Report

## Summary

Customer entry now offers **Continue as Guest**, **Continue with Google**, and **Continue with Email / Create Account** at equal visual weight. Technician entry offers Google + Email only (no Guest). Google Sign-In no longer disappears when disabled — it renders in a disabled state with an explanation.

## Guest mode implementation

See [GUEST_MODE_IMPLEMENTATION.md](./GUEST_MODE_IMPLEMENTATION.md) for full architecture.

Highlights:

- Local anonymous session (`guestSession.ts`) — no password, email, phone, or backend user.
- Auth bottom sheet on protected actions with resume after login.
- Guest header badge, drawer CTAs, and Guest AI (`POST /ai/guest/chat`).

## Google Sign-In root cause

**Root cause:** `ContinueWithGoogleButton` previously returned `null` when backend `GET /auth/google/config` reported `enabled: false` or missing `clientId` (typical when `GOOGLE_AUTH_ENABLED` defaults to false / unset in `.env`).

That looked like “Google button vanished” on Customer and Technician login screens even though the component was still mounted.

**Fix:** Always render the Google control (loading → ready or disabled). When not usable, show disabled **Continue with Google** plus:

> Google Sign-In is not enabled for this environment…

Optional `showWhenUnavailable={false}` remains for rare callers that must hide it.

**Ops to fully enable Google:**

```env
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...   # Capacitor
# server client / secret as required by googleAuth.service
```

## Files modified

### Guest / auth entry

- `packages/shared/auth/guestSession.ts` *(new)*
- `packages/shared/auth/AuthGateSheet.tsx` *(new)*
- `packages/shared/auth/ContinueWithGoogleButton.tsx`
- `packages/shared/auth/index.ts`, `packages/shared/index.ts`
- `packages/shared/ProtectedRoute.tsx`
- `packages/hooks/AuthProvider.tsx` — clear guest session on login/Google
- `apps/customer/pages/LoginPage.tsx` — Guest / Google / Email entry
- `apps/customer/pages/OnboardingPage.tsx` — Continue as Guest
- `apps/customer/pages/SplashPage.tsx` — resume guest session → home
- `apps/customer/pages/RegisterPage.tsx` — resume pending action
- `apps/customer/components/CustomerShell.tsx` — AuthGate + tab gates + Guest AI
- `apps/customer/routes.tsx` — `allowGuestBrowse`
- `apps/customer/pages/HomePage.tsx` — guest greeting / skip private APIs
- `apps/customer/pages/TechnicianProfilePage.tsx` — book/message gates + resume
- `apps/customer/components/CustomerOfferCard.tsx` — book/save gates
- `apps/technician/pages/LoginPage.tsx` — Google first, Email expand, no Guest

### Header / drawer

- `packages/shared/header/types.ts`, `menuConfig.ts`, `PortalHeader.tsx`, `HeaderProfileMenu.tsx`, `index.ts`

### Guest AI

- `packages/api/aiApi.ts` — `chatGuest`
- `packages/shared/AiAssistantLauncher.tsx`, `AiAssistantPanel.tsx`
- `backend/src/routes/index.ts` — `POST /ai/guest/chat`
- `backend/src/controllers/index.ts` — `chatGuest`
- `backend/src/validators/index.ts` — optional `guestSessionId`
- `backend/src/services/ai/ai.service.ts`, `context/context.manager.ts`, `tools/index.ts`, `tools/types.ts`

## Android verification

| Item | Notes |
|------|-------|
| Same web auth UI in Capacitor WebView | ✓ shared packages |
| Guest session in `localStorage` | ✓ persists across cold start when WebView storage retained |
| Google native bridge | Uses existing `signInWithGoogle` + bridge HTML; requires Android client ID when enabled |
| Guest AI / browse | Works offline for cached browse; AI needs network |

## Web verification

| Item | Notes |
|------|-------|
| Login shows Guest + Google + Email | ✓ |
| Google disabled state visible | ✓ when config not ready |
| Guest browse home/search/technician | ✓ |
| Protected tab opens sheet | ✓ |
| Book → login → resume | ✓ pending action |

## Authentication flow verification

| Flow | Status |
|------|--------|
| Guest session create (no backend user) | ✓ |
| Email login / register resume | ✓ |
| Google token → `loginWithGoogle` → session | ✓ (when configured) |
| Session persistence (`rememberMe`) | ✓ existing AuthProvider |
| Guest cleared on auth | ✓ AuthProvider + login handlers |
| Error handling (Google cancel / misconfig) | ✓ message + disabled hint |
| Technician without Guest | ✓ |

## Production readiness assessment

**Ready to ship Guest Mode** for Customer discovery on Web and Android, with auth gates and Guest AI.

**Google Sign-In** is UI-restored and production-capable once environment credentials are set. Until then, the button remains visible but disabled with a clear explanation — never silently missing.

### Remaining ops

1. Set Google OAuth env vars per environment and verify `/auth/google/config` returns `ready: true`.
2. Smoke-test Capacitor Google Sign-In on a device with the Android client ID.
3. Optionally forward `fixnow:guest-analytics` events to the production analytics pipeline.
