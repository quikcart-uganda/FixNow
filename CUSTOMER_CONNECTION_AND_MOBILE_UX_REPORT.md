# Customer Connection & Mobile UX Report

**Date:** 26 Jul 2026  
**Scope:** Customer portal — Desktop · Mobile Web · Android Capacitor  
**Approach:** Harden existing architecture. No API breaks. No hardcoded marketing content.

---

## Summary

Customer Home technician cards, location enable flow, connection status sheet, header layout, and offline/realtime indicators were audited and fixed. Floating status overlays that collided with notification badges were removed. Connection and location UIs now update live from Socket.IO, Capacitor Network/AppState, and GPS events.

---

## ✔ Responsive fixes — technician cards

| Before | After |
|--------|--------|
| Horizontal snap rail, ~208px cards | Responsive CSS grid |
| Single-line truncated names | Two-line `line-clamp-2` names |
| Truncated trade | Natural wrap (`line-clamp-2`) |
| Small avatar | 64–72px avatar |
| Initials-only / broken photos | Real photos via `ProfileAvatar`; hashed colour initials fallback |
| Missing distance / availability | Distance label + Available/Offline badge + verified mark |

**Grid breakpoints**

- Small phone: 1 column  
- Large phone (`min-[400px]`): 2 columns  
- Tablet (`md`): 3 columns  
- Desktop (`lg`): 4 columns  
- Wide (`xl`): 5 columns  

Equal card heights via `flex` + `mt-auto` Book CTA. Book target ≥ 48dp (`min-h-12`).

**Files:** `apps/customer/pages/HomePage.tsx`, `apps/customer/data.ts`, `packages/api/mappers.ts`, `packages/ui/ProfileAvatar.tsx`

---

## ✔ GPS / location workflow

Full pipeline on Enable Location:

1. Requesting permission… (browser + Capacitor Geolocation)  
2. Getting GPS location…  
3. Finding your address… (reverse geocode)  
4. Saving customer location (profile API / offline queue)  
5. Refresh nearby technicians / offers / marketing (`fixnow:location-updated` + `fixnow:resync`)  
6. Success state with address label, then auto-close  

**If denied / blocked**

- Open Settings (permanent deny)  
- Retry permission / Retry GPS  
- Use current city (from profile district)  
- Search address · Choose on map · Use saved address (profile links)

**Files:**  
`packages/shared/location/LocationPermissionHost.tsx`  
`packages/shared/location/LocationEducationSheet.tsx`  
`packages/shared/location/reverseGeocode.ts`

---

## ✔ Connection improvements

Connection sheet is live (not a stale snapshot):

| Row | Source |
|-----|--------|
| Internet | `useNetworkStatus` + Capacitor Network |
| Realtime socket | `useSocket` / `subscribeSocketStatus` |
| API | `/health` probe while sheet open |
| Location | `LocationPermissionHost` status |
| Notifications | `usePush` unread |
| Push | native permission / web Notification API |
| Last sync | updated on connect / successful health / queue flush |
| Pending sync | `subscribeOfflineQueue` |

**Behaviours**

- Reconnect button → `forceReconnectSocket()`  
- Auto-reconnect already wired via Network online, visibility, `fixnow:app-resume`  
- On reconnect: sheet shows Connected and auto-dismisses after ~2s unless the user interacted  
- Chip states: Online · Connecting · Offline · Poor network · Realtime lost · API offline · Syncing  

**Files:** `packages/shared/header/HeaderStatusControl.tsx`, `packages/shared/splash/useNetworkStatus.ts`

---

## ✔ Header redesign / status chip layout

| Issue | Fix |
|-------|-----|
| Floating status over header (CustomerShell) | Removed; status only in `PortalHeader` |
| Notification badge overlapping chip | Fixed right slot: Status → Notifications → Profile with consistent gaps |
| Hamburger on desktop customer | `md:hidden` (same pattern as Admin/Technician) |
| `hideStatus` on Home | Removed so Live chip sits in the header grid |

**Files:** `packages/shared/header/PortalHeader.tsx`, `apps/customer/components/CustomerShell.tsx`, `apps/customer/pages/HomePage.tsx`

---

## ✔ Android / Capacitor verification

| Capability | Status |
|------------|--------|
| Capacitor Network plugin bridge | Existing `initNativeNetwork` — re-dispatches `online`/`offline` |
| AppState resume → socket reconnect | `fixnow:app-resume` in `socketClient.bindBrowserNetwork` |
| Geolocation permission + GPS | Native Geolocation via `@fixnow/native` |
| Push permission readout in sheet | `getNativePushPermission` |
| Offline mutation queue | Unchanged; surfaced as Pending sync |

No 1Hz polling introduced. Health probe runs only while the connection sheet is open (12s interval). Socket auth sync remains event-driven + 5-minute fallback.

---

## ✔ Accessibility

- Primary actions use `min-h-11` / `min-h-12` (≥ 48dp)  
- Connection chip has `title` tooltip + `aria-expanded` / `aria-haspopup`  
- Location progress uses `aria-live="polite"`  
- Avatar verified/online indicators marked `aria-hidden` where decorative  
- Works in portrait; header wraps safely with `shrink-0` action cluster  

---

## Regression report

| Area | Expected | Risk / notes |
|------|----------|--------------|
| Technician search API | Unchanged | Client-only card/grid + distance labels |
| Marketing delivery | Unchanged | Still `placement: 'home'` |
| Location permission policy | Preserved | Cooldowns / blocked routes intact |
| Socket connect/disconnect | Unchanged | Sheet now reflects live status |
| Admin / Technician headers | Same PortalHeader | Customer hamburger now `md:hidden` like peers |
| OfflineBanner / splash | Compatible | `NetworkStatus` adds `'poor'` (callers checking `=== 'online'` still valid) |
| Profile save | Uses existing `customerApi.updateProfileResilient` | Offline queue if disconnected |

---

## Manual test checklist

- [ ] Desktop Chrome/Edge/Firefox — header: Live · Notifications · Profile, no hamburger ≥ md  
- [ ] Mobile web — hamburger, compact Live chip, 1–2 column cards  
- [ ] Android Capacitor — Network offline/online updates chip without app reload  
- [ ] Background → foreground — socket reconnects; sheet updates if open  
- [ ] Enable Location — progress steps then success; home reloads nearby techs  
- [ ] Deny location — denial sheet with city / search / map / saved address  
- [ ] GPS off — error step + Retry  
- [ ] Slow network (2g) — Poor network chip when browser reports it  
- [ ] Open connection sheet while offline → go online — Connected + auto-dismiss  
- [ ] Notification badge never overlaps Live chip  
- [ ] Technician cards: photo when present; coloured initials when not; no broken image icon  

---

## Key paths touched

- `apps/customer/pages/HomePage.tsx`  
- `apps/customer/components/CustomerShell.tsx`  
- `apps/customer/data.ts`  
- `packages/shared/header/PortalHeader.tsx`  
- `packages/shared/header/HeaderStatusControl.tsx`  
- `packages/shared/location/*`  
- `packages/shared/splash/useNetworkStatus.ts`  
- `packages/ui/ProfileAvatar.tsx`  
- `packages/api/mappers.ts`  
