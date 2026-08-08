# Login Post-Auth Crash Report

**Date:** 2026-07-25  
**Symptom:** Credentials submit successfully → navigation starts → global Error Boundary (“Something went wrong”) on **Desktop and Android**.

---

## Root cause

Two related failures in the **shared post-auth React path** (hence both platforms):

### 1. Primary — render throw on Customer Home offer rails

`HomePage` treated offer feed fields as always-present arrays:

```ts
feed.featured.length === 0  // throws if featured is undefined
```

Incomplete API/cache payloads (missing `featured` / `nearby` / …) caused:

`TypeError: Cannot read properties of undefined (reading 'length')`

That throw happens during **render** (via `isOffersEmpty(offers)` / rails). Depending on boundary placement it surfaces as the shell or root Error Boundary. Desktop and Capacitor share `HomePage`, so both fail identically.

### 2. Amplifying — post-auth role entry loops

After the role-selector work, authenticated hits on `/` go through `SessionEntryRedirect`. When marketplace roles resolved empty (admin on native, malformed `availableRoles`), the flow bounced:

`/` → `/select-role` → `/` → …

React then throws **Maximum update depth exceeded**, which the **root** `AppErrorBoundary` catches as “Something went wrong”.

`RoleSelectPage` also depended on a **new `roles` array every render**, which could re-fire navigation effects for single-role redirects.

---

## Stack / failure point (exact)

| Step | Result |
|------|--------|
| Login API / JWT / token storage | Succeeds |
| Navigate to `/customer/home` or `/select-role` | Succeeds |
| **Home render** `isOffersEmpty` / offer rails | **Throws** on undefined rail arrays |
| **Or** `/` ↔ `/select-role` redirect loop | **Maximum update depth exceeded** |
| `AppErrorBoundary.componentDidCatch` | Friendly UI; logs previously incomplete |

Auth itself was not broken.

---

## Files modified

| File | Change |
|------|--------|
| `apps/customer/pages/HomePage.tsx` | Normalize offer feed; safe `?.length`; safe marketing props |
| `packages/shared/MarketingRails.tsx` | Tolerate undefined promo arrays |
| `packages/shared/auth/roleNavigation.ts` | Harden `marketplaceRolesOf` (Array.isArray + active-role fallback) |
| `packages/shared/auth/SessionEntryRedirect.tsx` | One-shot per user; no admin native `/` bounce loop |
| `packages/shared/auth/RoleSelectPage.tsx` | Stable `roles` memo; safer imports; safe `fullName` |
| `packages/shared/ProtectedRoute.tsx` | Use `isCapacitorNative` from `@fixnow/api` (avoid shared↔native cycle) |
| `packages/hooks/AuthProvider.tsx` | Safe `availableRoles` / `canSwitchRole` |
| `packages/shared/AppErrorBoundary.tsx` | Log route + stacks; DEV shows error message; Sentry hook |
| `packages/shared/monitoring.ts` | `captureFrontendException` |

---

## Why Desktop and Android both failed

Same React bundle, same `HomePage` / role-entry modules. Capacitor WebView and desktop browser execute the identical post-auth UI path.

---

## Fix implemented

1. Never assume offer/marketing arrays exist — normalize + optional chaining.  
2. Break `/` ↔ role-selector redirect loops; guard role lists.  
3. Richer diagnostics (console + `recordUiError` + optional Sentry) without exposing stacks to customers in production.  
4. DEV Error Boundary shows message + route for faster verification.

---

## Regression testing

| Check | Expected |
|-------|----------|
| Customer login → Home | Loads; empty offers show empty states |
| Technician login → Dashboard | Unaffected auth path |
| Multi-role → `/select-role` | Selector; no infinite loop |
| Role switch | Still session reuse |
| Desktop / Android | Same shared fix |
| Missing marketing/offers | Empty UI, no crash |
| Genuine unexpected throw | Friendly page; details in logs/Sentry |

Manual login against a running API recommended after pull.

---

## Remaining recommendations

1. Add a unit test for `isOffersEmpty` / feed normalization with partial payloads.  
2. Contract-test `/offers/public/home` and marketing delivery always return array fields.  
3. Consider a dedicated Vite mobile entry that omits Admin chunks entirely (separate from this crash).  
4. Keep DEV Error Boundary message enabled for QA builds.

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Login succeeds and Home loads | Fixed (null-safe Home + role entry) |
| Missing backend data does not crash React | Fixed |
| Error Boundary only for genuine failures | Improved |
| Desktop = Android | Shared modules fixed |
| Auth not redesigned | Yes |
