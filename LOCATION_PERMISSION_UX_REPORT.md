# Location Permission UX Report

**Date:** 2026-07-26  
**Scope:** Customer + Technician apps (Capacitor Android/iOS + mobile/desktop web)  
**Principle:** Explain before ask. Never interrupt launch, auth, or checkout.

---

## 1. Permission flow

```
App launch
  └─ Browse / login / onboarding freely (no OS location prompt)

Active use (2–5 min customer / 2–3 min technician)
  OR location-dependent feature (search, post job, go online, live tracking, …)
  └─ Educational BottomSheet (in-app)
        ├─ Enable Location → native / browser permission dialog
        │     ├─ Granted → read GPS; enable nearby / tracking benefits
        │     ├─ Denied → soft deny; app continues; cooldown before re-ask
        │     └─ Permanently denied → Settings CTA only (no OS re-prompt)
        └─ Not Now / Later → dismiss; 48h cooldown; fallback modes
```

### States

| Status | Meaning | UX |
|--------|---------|----|
| `not_requested` | OS still promptable; education not completed | Deferred or contextual education |
| `granted` | Access allowed | Full nearby / tracking features |
| `denied` | Soft refuse | Fallback + rare reminders |
| `permanently_denied` | OS will not show dialog again | Open Settings only |
| `unsupported` | No geolocation API | Silent fallback |

### Core modules

| Module | Role |
|--------|------|
| `packages/native/locationPermission.ts` | Check / request / prefs / open settings |
| `packages/native/nativeDevice.ts` | `getCurrentPosition` **never** auto-requests by default |
| `packages/shared/location/*` | Policy, education sheet, host, settings card |
| Shells | `LocationPermissionHost` on Customer + Technician |

---

## 2. Customer experience

1. Browse Home, categories, offers immediately — **no location ask**.
2. After **~3 minutes** of authenticated shell time (or earlier on Search / Post Job / nearby rail / share location), show:

   **Find trusted professionals near you**  
   Turn on location to see nearby technicians, faster response times, and more accurate pricing.  
   **Enable Location** | **Not Now**

3. If declined:
   - Nearby rails keep using **profile district / city**.
   - Post Job still publishes with parish/district fallback (GPS optional).
   - Soft banner explains fallback; dismissible.
4. Re-enable anytime: **Profile & Settings → Location**.
5. Permanent deny: sheet + settings deep-link; no repeated OS prompts.

---

## 3. Technician experience

1. Login, profile, earnings work without location.
2. After **~2.5 minutes**, or on **Go online / Nearby Jobs / En Route tracking**, show:

   **Receive jobs near you**  
   Enable location so we can match you with nearby jobs, improve arrival estimates, and update customers while you're en route.  
   **Enable Location** | **Later**

3. If declined:
   - Job feed continues via **service area / city** (existing `jobsApi.nearby` profile geo).
   - Clear notice that enabling location improves matching and live tracking.
4. Settings: **Privacy → Location** card with status + Enable / Open Settings.
5. Live tracking only after education when status is En Route / Started.

---

## 4. Retry policy

| Rule | Value |
|------|--------|
| Max educational prompts per session | **1** (contextual permanent-deny help may use the same session budget) |
| Customer defer | **3 minutes** |
| Technician defer | **2.5 minutes** |
| After dismiss | **48 hours** before soft deferred re-ask |
| Soft deny without permanent flag | **72 hours** before deferred nag |
| Permanent deny | **Never** call `requestPermissions` again; Open Settings only |
| Blocked routes | Login, register, forgot-password, onboarding, payments/*, account delete, splash roots |

---

## 5. Background tracking lifecycle

| Phase | Behavior |
|-------|----------|
| Offline / Available without job | **No** continuous GPS stream |
| Go online | Educational prompt; availability still saves without GPS |
| Job En Route / Started | `useTrackingPublisher` → adaptive foreground pings via `watchPositionAdaptive` |
| Pause UI | Server pause; local watch continues only while status remains En Route/Started |
| Complete / leave En Route/Started / unmount | Watch **stopped**; no further pings |
| True OS background location (`ACCESS_BACKGROUND_LOCATION` / iOS Always) | **Not enabled** in manifests yet — FixNow uses **foreground adaptive tracking while the job is active**. Documented for a future foreground-service phase. |

---

## 6. Privacy safeguards

- Pre-permission rationale always precedes the OS dialog.
- No silent Cap `requestPermissions` inside `getCurrentPosition` (default `requestPermission: false`).
- Chat “Share location” uses the shared bridge + education (no raw `navigator.geolocation` bypass).
- Diagnostics log status transitions (`location_permission:*`) for support — **not shown in UI**.
- Fallback copy never exposes internal permission enums to users.
- Critical flows (auth / payments) never show the sheet.

---

## 7. Performance considerations

- Permission prefs use existing cache layer (localStorage / Preferences) with long TTL.
- Tracking poll intervals remain adaptive (≈8s moving / ≈20s stationary).
- Deferred timer is a single `setTimeout` per host; cancelled on unmount.
- `getCurrentPosition` short-circuits when not granted — avoids OS round-trips.
- Education sheet is lazy in the sense of mount-on-open BottomSheet (no map load).

---

## 8. Regression testing

### Must pass

- [ ] Cold launch Customer / Technician — **no** location dialog on splash or login  
- [ ] Browse Home 30s — still no prompt  
- [ ] After ~3 min on Customer home — education sheet appears once  
- [ ] Not Now → sheet closes; browse continues; district-based nearby still works  
- [ ] Post Job without location → job creates with parish/district fallback  
- [ ] Post Job → Enable Location → OS dialog → coords attached when granted  
- [ ] Search / share location triggers education only if policy allows  
- [ ] Payments / login / onboarding never show location sheet  
- [ ] Technician Go Online without grant → availability still saves + soft notice  
- [ ] Nearby Jobs feed loads without GPS  
- [ ] En Route with grant → pings start; leave status → pings stop  
- [ ] Permanent deny → Open Settings works (iOS app-settings / Android app details)  
- [ ] Settings Location card reflects status after grant/deny  
- [ ] `window.__FIXNOW_DIAG__` mobile snap includes location permission fields  
- [ ] Android, iOS, mobile web, tablet, desktop — sheet responsive, no FAB overlap  

### Call-site checklist

| Surface | Expected |
|---------|----------|
| `getCurrentPosition` | No OS prompt unless `requestPermission: true` |
| `PostJobPage` | `ensureLocation('post_job')` |
| `ChatThread` | `ensureLocation('share_location')` |
| `SearchPage` / Home | Contextual ensure |
| `AvailabilityPage` / Jobs feed | Contextual ensure |
| `useTrackingPublisher` | Ensure then watch; stop when disabled |

---

## Files touched

- `packages/native/locationPermission.ts` *(new)*
- `packages/native/nativeDevice.ts`
- `packages/native/index.ts`
- `packages/native/diagnostics.ts`
- `packages/api/diagnostics.ts` / `packages/api/index.ts`
- `packages/shared/location/*` *(new)*
- `packages/shared/index.ts`
- `packages/shared/ChatThread.tsx`
- `packages/shared/tracking/useTrackingPublisher.ts`
- `apps/customer/components/CustomerShell.tsx`
- `apps/customer/pages/{PostJob,Search,Home,ProfileSettings}Page.tsx`
- `apps/technician/components/layout/AppShell.tsx`
- `apps/technician/pages/{Availability,JobsFeed,Privacy}Page.tsx`
