# User Experience Hardening Report

**Date:** 2026-07-28  
**Scope:** Customer and technician mobile UX; profile photo flows; developer-oriented UI removal across portals.  
**Related:** `ADMIN_SECURITY_AND_DIAGNOSTICS_AUDIT.md` (Admin Platform Health / Sign Out).

---

## Executive summary

| Area | Result |
|------|--------|
| Availability / Connection sheet | User-facing only — Socket.IO, API, sync queue, push internals removed |
| Profile photo | URL paste removed; Camera / Gallery → upload → save URL internally |
| Developer UI in customer/technician | Cleared from primary flows |
| Admin residual URL paste | Marketing/CMS upload-first (paste fields removed where found) |
| Developer diagnostics | Remain gated (Admin Platform Health Developer Mode / Vite DEV) |

---

## 1. Availability redesign

**Component:** `packages/shared/header/HeaderStatusControl.tsx`  
**Surfaces:** Customer header, Technician header, Admin connection sheet.

### Removed from user-facing UI

- Realtime socket / Socket.IO labels  
- API Reachable / Unreachable  
- Last sync timestamp  
- Pending sync queue counts  
- Push “Supported / Unsupported / Enabled (web)” implementation wording  

### Replaced with

| Role | Shows |
|------|--------|
| **Technician** | Current availability · Location sharing · Working hours summary · Notifications · Receive / Busy / Pause receiving jobs · Working hours link · Retry connection when offline |
| **Customer** | Connection (friendly) · Location sharing · Notifications · Enable location / notifications · Retry when needed · Back to home |
| **Admin** | Friendly connection · Notifications · Link to Platform health (no raw diagnostics in the sheet) |

Connectivity problems use plain language (“You appear to be offline…”, “Weak connection…”, “Retry connection”). Background health probes still run for the status chip colour only.

---

## 2. Image upload workflow

**Shared component:** `packages/shared/ProfilePhotoPicker.tsx`

### Flow

1. User taps profile avatar  
2. Sheet: **Take photo** · **Choose from gallery** · **Cancel**  
3. Capacitor Camera (`takePhoto` / `pickFromGallery`) on native; file/`capture` input on web  
4. Image compressed via Camera plugin (`quality: 72`, max width 1600)  
5. `uploadMediaFile(..., 'profile')` → configured storage  
6. Returned URL saved via `customerApi.updateProfile` / `technicianApi.updateProfile`  
7. Profile refreshes immediately  

Users never see or paste image URLs.

### Wired on

| Portal | Page |
|--------|------|
| Technician | `ProfileSetupPage` (replaced “Profile photo URL” input) |
| Technician | `ProfilePage` (tappable avatar) |
| Customer | `ProfileSettingsPage` (tappable avatar) |
| Admin | No self-profile photo editor existed; no URL field found |

---

## 3. Developer UI removed or relocated

### Removed / redesigned

| Item | Location | Action |
|------|----------|--------|
| Socket / API / sync / push dump | `HeaderStatusControl` | User-friendly status only |
| Profile photo URL input | Technician `ProfileSetupPage` | Replaced with `ProfilePhotoPicker` |
| Category banner URL paste | `CategoriesPage` | Upload-only |
| Banner “Or paste image URL” | `BannerManagementPage` | Media library + crop only |
| Sponsored content URL paste fields | `SponsoredContentPage` | Media library per image role |
| Content block “Image URL” | `ContentBlocksPage` | File upload via `uploadMediaFile` |
| `window.__fixnowShowPush` | `PushProvider` | DEV builds only |
| Admin menu “Platform status” copy | `menuConfig` | Softened to “Connection” |

### Kept behind developer / admin gates

| Surface | Access |
|---------|--------|
| Platform health Developer Diagnostics | Development Mode or Vite DEV |
| Provider Manager | Authenticated Admin (ops) |
| Development Controls | Super Admin tooling |
| `window.__FIXNOW_DIAG__` | DEV builds only (prior audit) |

### Not treated as developer leaks

- Offline banner (“waiting to send” style queue hint) — user-safe  
- Payment receipt JSON **download** (user-initiated export)  
- Audit Logs (business security trail)  

---

## 4. Remaining production UX issues

1. **Customer “Edit profile”** still routes to the same Profile & Settings page — no separate name/phone editor beyond photo.  
2. **Admin self-avatar** — no in-app photo change for administrators (out of scope unless a profile page is added).  
3. **Notification “last delivery”** on Platform Health still approximates from provider test timestamps when delivery telemetry is unavailable.  
4. **Marketing CTA href fields** remain text inputs (links, not image URLs) — acceptable for CMS operators.  
5. **Page target enums** on Content Blocks (`customer.home`, etc.) remain visible to marketing admins — consider friendlier labels later.  
6. Shared-device risk: ensure Sign Out continues to clear developer-diagnostics prefs (already done in Auth logout).

---

## 5. Files touched

- `packages/shared/header/HeaderStatusControl.tsx`  
- `packages/shared/ProfilePhotoPicker.tsx` (new)  
- `packages/shared/index.ts`  
- `packages/shared/header/menuConfig.ts`  
- `packages/hooks/PushProvider.tsx`  
- `apps/technician/pages/ProfileSetupPage.tsx`  
- `apps/technician/pages/ProfilePage.tsx`  
- `apps/customer/pages/ProfileSettingsPage.tsx`  
- `apps/admin/pages/CategoriesPage.tsx`  
- `apps/admin/pages/marketing/BannerManagementPage.tsx`  
- `apps/admin/pages/marketing/SponsoredContentPage.tsx`  
- `apps/admin/pages/marketing/ContentBlocksPage.tsx`  

---

*End of report.*
