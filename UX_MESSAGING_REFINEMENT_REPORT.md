# UX Messaging Refinement Report

**Date:** 2 August 2026  
**Scope:** Customer & Technician interfaces (Web + Android via shared packages)  
**Constraint:** Presentation only — no auth, payment, governance, subscription, Capability Engine, Developer Mode, or RBAC logic changes.

---

## 1. Summary

FixNow customer and technician surfaces previously leaked implementation language (OAuth, environment, Platform Mode, entitlement engine, Sandbox, CORS/API, Database). Those strings are now classified and routed through a central UX message layer, with friendly public copy for production users and gated Development Mode copy for the Permanent Development Technician / Developer Preview only.

---

## 2. UX Message Policy

| Audience | Where it may appear | Rule |
|----------|---------------------|------|
| **Public** | Customer, Technician, Guest, shared auth | Plain English, reassuring, action-oriented; no jargon |
| **Admin** | Command Center / operational tools | Operational detail allowed |
| **Developer** | Permanent Development Technician, Developer Preview panels | Development Mode guidance only; never for ordinary production users |

Central module: `packages/shared/ux/`

- `policy.ts` — audience types
- `messages.ts` — catalogued copy (`UX_AUTH`, `UX_SUBSCRIPTION`, `UX_DEVELOPMENT`, `UX_SYSTEM`, `UX_MARKETPLACE`)
- `index.ts` — exports (+ re-exported from `@fixnow/shared`)

---

## 3. Messages audited and changed

### 3.1 Authentication — Google Sign-In

| Field | Value |
|-------|--------|
| **Screen** | Technician & Customer login / register (shared Google button) |
| **Old** | `Google Sign-In is not enabled for this environment. Use email, or ask an admin to configure Google OAuth.` |
| **New** | `Google Sign-In is currently unavailable. Please sign in using your email and password.` |
| **Reason** | Removed environment / OAuth / admin-configuration leakage |
| **Classification** | Public |
| **Files** | `packages/shared/auth/ContinueWithGoogleButton.tsx` |

| Field | Value |
|-------|--------|
| **Screen** | Same (missing client ID hint) |
| **Old** | `Google Sign-In is enabled but the client ID is missing.` |
| **New** | Same as unavailable (above) |
| **Reason** | Client ID is a developer/config detail |
| **Files** | `packages/shared/auth/ContinueWithGoogleButton.tsx` |

| Field | Value |
|-------|--------|
| **Screen** | API errors when Google auth gate fails |
| **Old** | `Google Sign-In is disabled` / `Google Sign-In is not configured` |
| **New** | `Google Sign-In is currently unavailable. Please sign in using your email and password.` |
| **Reason** | Align API error text with public UX; no config wording |
| **Files** | `backend/src/services/auth/googleAuth.service.ts` |

---

### 3.2 Subscription payment (production technicians)

| Field | Value |
|-------|--------|
| **Screen** | Technician Upgrade → Checkout footer |
| **Old** | `Access unlocks only after admin approval — never automatically.` |
| **New** | `We'll notify you as soon as your payment has been verified.` |
| **Reason** | Reassuring; removes ALL-CAPS distrust / legal-disclaimer tone |
| **Classification** | Public |
| **Files** | `apps/technician/pages/UpgradePage.tsx` via `UX_SUBSCRIPTION.paymentReviewNotice` |

| Field | Value |
|-------|--------|
| **Screen** | Catalogue payment instructions (shown on checkout) |
| **Old** | `…Access unlocks after FixNow verifies your payment.` |
| **New** | `…Your subscription becomes active after FixNow verifies your payment.` |
| **Reason** | Friendlier wording without “unlocks” alarm tone |
| **Files** | `backend/src/services/marketplace/subscription.service.ts` |

| Field | Value |
|-------|--------|
| **Screen** | Upgrades paused |
| **Old** | `FixNow Admin has paused new subscription purchases…` |
| **New** | `New subscription purchases are paused for now. You can still use your current access.` |
| **Reason** | Avoid exposing admin implementation |
| **Files** | `apps/technician/pages/UpgradePage.tsx` |

---

### 3.3 Development Mode — Permanent Development Technician

| Field | Value |
|-------|--------|
| **Screen** | Upgrade checkout when Dev Transaction flow is enabled |
| **Old (banner)** | `Development verification` + Platform Mode / entitlement engine instructions |
| **New** | **Development Mode** — `Use a Development Transaction ID to activate this plan for testing. No Mobile Money payment is required.` |
| **Old (footer)** | `Development verification activates through the same entitlement engine — no MoMo required.` |
| **New (footer)** | `Development Mode activates this plan for testing — no Mobile Money payment is required.` |
| **Old (empty pool)** | `Ask Admin → Seed Platform to provision the pool.` |
| **New** | `No Development Transaction IDs are available for this plan right now.` |
| **Reason** | Dev Tech still gets clear testing guidance; no Platform Mode / Seed Platform / entitlement engine in UI |
| **Classification** | Developer (gated by existing `developmentTransaction.enabled`) |
| **Files** | `UpgradePage.tsx`, `UX_DEVELOPMENT.*`, `developmentTransaction.service.ts` (API `instructions`) |

| Field | Value |
|-------|--------|
| **Screen** | Auto-verify success toast/message |
| **Old** | `{plan} activated via Development Transaction ID` |
| **New** | `{plan} activated for testing` |
| **Files** | `subscription.service.ts` (message string only) |

**Invariant preserved:** Production technicians never see the Development Mode banner; it only renders when `useDevTx` is true.

---

### 3.4 Developer Preview (eligible accounts only)

| Field | Value |
|-------|--------|
| **Screen** | Preview banner / Upgrade preview section / Subscription Centre |
| **Old** | Sandbox, entitlement engine, “temporary entitlement session”, “production entitlements” |
| **New** | Development Mode / preview language — testing features, no payments/invoices |
| **Reason** | Keep guidance useful for testers without Sandbox/engine jargon |
| **Classification** | Developer |
| **Files** | `DeveloperPreviewBanner.tsx`, `UpgradePage.tsx`, `SubscriptionCentrePage.tsx`, `DevelopmentSubscriptionSimulatorPanel.tsx` |

---

### 3.5 Shared error sanitisation

| Field | Value |
|-------|--------|
| **Screen** | Any Customer/Technician error via `getFriendlyErrorMessage` |
| **Old** | `Database temporarily unavailable…` / CORS LAN URL admin instructions |
| **New** | `Service temporarily unavailable…` / `Unable to reach FixNow from this device…` |
| **Reason** | Hide database / CORS / API internals |
| **Files** | `packages/api/errors.ts`, `packages/shared/AsyncStateView.tsx` |

| Field | Value |
|-------|--------|
| **Mechanism** | `looksLikeInternalMessage` |
| **Change** | Also flags `OAuth`, `Platform Mode`, `entitlement engine`, `Sandbox`, `RBAC`, `middleware`, `CORS` |
| **Reason** | Defence-in-depth if backend ever returns diagnostic text |

---

### 3.6 Marketplace (customer)

| Field | Value |
|-------|--------|
| **Screen** | Offers empty state |
| **Old** | `…after admin approval.` |
| **New** | `…after they are reviewed.` |
| **Files** | `apps/customer/pages/OffersPage.tsx` |

| Field | Value |
|-------|--------|
| **Screen** | Job tracking refund alert |
| **Old** | `Refund requested. Waiting for admin approval.` |
| **New** | `Refund requested. We'll notify you once it's been reviewed.` |
| **Files** | `apps/customer/pages/JobTrackingPage.tsx` |

---

## 4. Screens affected

| Area | Screens |
|------|---------|
| Auth | Shared Google button (Customer + Technician login/register) |
| Subscriptions | Upgrade checkout, pending, paused, preview section |
| Preview | Developer Preview banner, Subscription Centre preview timeline |
| Dev Tech | Development plan simulator panel |
| Errors | Global friendly error mapper + AsyncStateView titles |
| Customer | Offers empty, refund alert |
| Backend copy | Google auth gate, Dev TX instructions, catalogue payment instructions, Dev TX activate message |

Android displays identical messaging (Capacitor apps consume the same shared packages).

---

## 5. Files modified

### New
- `packages/shared/ux/policy.ts`
- `packages/shared/ux/messages.ts`
- `packages/shared/ux/index.ts`
- `UX_MESSAGING_REFINEMENT_REPORT.md` (this file)

### Updated
- `packages/shared/index.ts`
- `packages/shared/auth/ContinueWithGoogleButton.tsx`
- `packages/shared/AsyncStateView.tsx`
- `packages/api/errors.ts`
- `apps/technician/pages/UpgradePage.tsx`
- `apps/technician/pages/SubscriptionCentrePage.tsx`
- `apps/technician/components/DeveloperPreviewBanner.tsx`
- `apps/technician/components/DevelopmentSubscriptionSimulatorPanel.tsx`
- `apps/customer/pages/OffersPage.tsx`
- `apps/customer/pages/JobTrackingPage.tsx`
- `backend/src/services/auth/googleAuth.service.ts`
- `backend/src/services/sandbox/seed/developmentTransaction.service.ts`
- `backend/src/services/marketplace/subscription.service.ts`

---

## 6. Messages intentionally left unchanged

| Message / area | Why left unchanged |
|----------------|--------------------|
| Admin Command Center / Seed Platform / Sandbox Management UI | Administrator audience — operational language is appropriate |
| Plan feature strings like “Before & after galleries are not enabled on your plan” | Already plain and action-oriented |
| Auth credential errors (`Incorrect email or password`) | Already public-friendly |
| `DevOtpNotice` (“Your verification code: …”) | Already product-facing; no environment labels |
| Code comments mentioning entitlement engine / JWT | Not user-visible |
| `approvePayment` audit note for Dev TX | Internal/admin audit trail, not checkout chrome |
| Capability/RBAC denial strings inside Admin apps | Admin audience |
| Camera `capture="environment"` attributes | HTML media API, not UX copy |
| Stitch HTML reference mockups under `apps/customer/reference` | Design references, not runtime UI |

---

## 7. Validation checklist

| Check | Status |
|-------|--------|
| No OAuth terminology for normal users | Pass |
| No Sandbox terminology for customers / ordinary technicians | Pass |
| No Platform Mode terminology for technicians | Pass |
| No entitlement engine / CORS / Database / client ID in production UX | Pass |
| Development Technician still sees Development Mode + Dev TX guidance | Pass (gated by `developmentTransaction.enabled`) |
| Production users see friendly payment-review copy | Pass |
| Auth / payment / governance / entitlement logic unchanged | Pass (copy + presentation only) |
| Web and Android share messaging via `@fixnow/shared` / `@fixnow/api` | Pass |

---

## 8. Follow-up (optional, not in this change)

- Migrate remaining hardcoded friendly strings (register validation, job apply errors) onto `UX_*` keys for full localisation readiness.
- Add admin-audience catalog under `packages/shared/ux` when Command Center copy is standardised.
- Unit-test `looksLikeInternalMessage` against a regression list of banned terms.
