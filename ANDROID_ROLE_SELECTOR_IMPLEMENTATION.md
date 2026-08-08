# Android Role Selector Implementation

**Date:** 2026-07-25  
**Scope:** Capacitor Android serves Customer + Technician only; Admin remains web-only; QuikCart-inspired post-auth role selection within FixNow’s existing auth.

---

## Architecture changes

| Surface | Customer | Technician | Admin |
|---------|----------|------------|-------|
| Web | Yes | Yes | Yes |
| Android (Capacitor) | Yes | Yes | **No** (routes gated, landing hidden, deep links blocked) |

- One identity may own Customer and/or Technician profiles (unchanged backend model).
- After login: **one role → that experience**; **both roles → `/select-role`**.
- Cold start with a session: prefer **last selected role** (`fixnow_last_role`); otherwise selector when both exist.
- **Switch Role** opens the selector; `switchRole` re-issues tokens without logout.
- Backend authorization unchanged; Android only consumes existing APIs.

---

## Authentication flow

```
Login / Google (preferredRole optional)
  → availableRoles from /auth responses
  → 1 marketplace role  → role home
  → 2 marketplace roles → /select-role
  → pick role → switchRole if needed → home (or deep-link `from`)

Cold start at /
  → SessionEntryRedirect
  → last role if still available → activate + home
  → else 1 role → home
  → else /select-role
```

Admin users on web resume to `/admin/dashboard`. On native, admin paths resolve to `/`.

---

## Role selector flow (UX)

Screen: `RoleSelectPage` (`/select-role`)

- Copy pattern (QuikCart-inspired, FixNow branding):  
  **Welcome back, {firstName}** / **Choose how you'd like to continue.**
- Cards: **Customer** — Book trusted professionals. / **Technician** — Manage jobs, offers and earnings.
- “Last used” badge when `getLastSelectedRole()` matches.
- Sign out available on the selector.
- Settings/Profile: **Switch Role** → `/select-role` (no sign-out).

---

## Routing changes

| Path | Web | Android |
|------|-----|---------|
| `/` | Landing (3 portals) or session resume | Landing (2 portals) or session resume |
| `/select-role` | Role picker | Role picker |
| `/customer/*` | Yes | Yes |
| `/technician/*` | Yes | Yes |
| `/admin/*` | `AdminRoutes` | `Navigate` → `/` (Admin chunk not mounted) |

---

## Android exclusions

1. `AdminPortalGate` — does not render `AdminRoutes` on `isNativePlatform()`.
2. `PlatformLanding` — Admin card omitted on native; note that admin is web-only.
3. Deep links / push — `/admin…` normalized to `/`; `isRoutableAppPath` excludes admin on native.
4. `ProtectedRoute` — wrong-role redirect never sends native users to `/admin/dashboard`.

Admin APIs remain server-protected as before; this change only removes Admin **UI navigation** from Capacitor.

---

## Files modified / added

**Added**

- `packages/shared/auth/roleNavigation.ts`
- `packages/shared/auth/RoleSelectPage.tsx`
- `packages/shared/auth/SessionEntryRedirect.tsx`
- `ANDROID_ROLE_SELECTOR_IMPLEMENTATION.md`

**Modified**

- `src/App.tsx` — root entry, `/select-role`, native Admin gate
- `src/PlatformLanding.tsx` — hide Admin on native
- `packages/shared/auth/SwitchRoleControl.tsx` — navigates to selector
- `packages/shared/auth/index.ts`, `packages/shared/index.ts` — exports
- `packages/shared/ProtectedRoute.tsx` — native-safe admin home
- `packages/native/deepLinks.ts` — admin blocked on native; `/select-role` routable
- `apps/customer/pages/LoginPage.tsx` — post-auth destination + multi-role selector
- `apps/technician/pages/LoginPage.tsx` — same
- `apps/customer/pages/ProfileSettingsPage.tsx` / `apps/technician/pages/SettingsPage.tsx` — already host Switch Role

**Not redesigned:** auth service, JWT issuance, RBAC middleware, business modules.

---

## Regression testing

| Check | Expected | Status |
|-------|----------|--------|
| Customer-only login | → Customer home | Implemented |
| Technician-only login | → Technician home | Implemented |
| Multi-role login | → Role selector | Implemented |
| Role pick + switch | Tokens refresh; no logout | Reuses `switchRole` |
| Switch Role in Settings | Opens selector | Implemented |
| Cold start + last role | Resume last experience | Implemented |
| Web Admin landing + `/admin` | Unchanged | Implemented |
| Android `/admin` | Redirect `/` | Implemented |
| Android landing | No Admin card | Implemented |
| Customer/Technician UX parity | Same portals as web | Unchanged portals |

Manual device QA after `npm run cap:sync` recommended.

---

## Remaining recommendations

1. Optional: separate Vite mobile build that omits `@admin` from the graph entirely (stronger bundle exclusion than runtime gate).
2. Add unit tests for `marketplaceRolesOf` / `resolvePostAuthDestination`.
3. Consider a shared mobile “Sign in” entry that skips portal choice before auth (further QuikCart alignment); current portal login pages remain for web parity.
4. Ensure Google native handoff still passes `availableRoles` through to the selector (same auth responses).

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| Android: Customer + Technician only | Yes |
| Admin web-only | Yes |
| Multi-role selector after login | Yes |
| Switch role without sign-out | Yes |
| Last role remembered | Yes |
| Auth/business logic unchanged | Yes |
| Isolated, regression-safe changes | Yes |
