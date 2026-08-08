# Notification & Bottom Sheet UX Report

## Verdict

Clipping and poor drag came from a **shared `BottomSheet`** that attached touch-drag to the entire panel (fighting scroll), plus **bottom chrome** (tabs / safe area / fixed banners) that overlapped content. Sheets are now max-height constrained, handle-led draggable, scrollable independently, and safe-area aware. Location / download prompts inherit these fixes.

---

## 1. Components audited

| Component | Path | Role |
| --- | --- | --- |
| BottomSheet | `packages/ui/BottomSheet.tsx` | Shared sheet primitive |
| LocationEducationSheet | `packages/shared/location/LocationEducationSheet.tsx` | Location educate / denied / progress |
| LocationPermissionHost + fallback banner | `packages/shared/location/LocationPermissionHost.tsx` | Host + fixed chip |
| AppDownloadSheet | `packages/shared/appDownload/AppDownloadSheet.tsx` | Store prompt |
| AuthGateSheet | `packages/shared/auth/AuthGateSheet.tsx` | Guest auth (uses BottomSheet) |
| Header sheets | `HeaderProfileMenu`, `HeaderStatusControl`, … | Shared |
| OfflineBanner | `packages/native/OfflineBanner.tsx` | Top strip (OK) |
| OfflineQueueHost | `packages/native/OfflineQueueHost.tsx` | Bottom chip |
| CustomerShell nav | `apps/customer/components/CustomerShell.tsx` | Tab bar |
| OfferDetail / PayJob footers | customer pages | Sticky CTAs |

---

## 2. Root cause of clipping

1. **Customer nav:** `h-16` + `pb-safe` compressed the bar into the home indicator instead of growing above it.
2. **Location fallback banner:** `bottom-[4.75rem] z-40` without safe-area inset; sat under / into tabs (`z-50`).
3. **Sheet body:** Drag handlers on the whole panel prevented reliable scroll; tall denied sheets felt clipped.
4. **CSS double safe-area:** `.fixnow-sheet-panel` padding + child `pb-safe` inflated layout inconsistently.
5. **Page CTAs:** Offer/Pay `bottom-0` under customer tabs.

---

## 3. Safe area fixes

| Surface | Change |
| --- | --- |
| BottomSheet panel | Inline `paddingBottom: max(0.75rem, env(safe-area-inset-bottom))`; panel `max-h-[min(92dvh,720px)]` |
| `.fixnow-sheet-panel` CSS | Removed duplicate padding-bottom |
| Location / AppDownload children | Removed extra `pb-safe` |
| Customer tabs | `min-h-16` + `pb-[max(0.5rem,env(safe-area-inset-bottom))]` (bar grows) |
| Location banner | `bottom: calc(4.75rem + env(safe-area-inset-bottom))`, `z-[55]` above tabs |
| OfferDetail / PayJob | Mobile bottom padding clears tabs + safe area; `md:pb-4` on desktop |

---

## 4. Drag behaviour improvements

| Before | After |
| --- | --- |
| Touch drag on entire panel | Drag primarily on **handle** (`touch-none`) |
| Scroll fought dismiss | Body drag only when `scrollTop === 0` and pull-down |
| Transform fought enter animation | Transition cleared while dragging |
| No panel max height | Flex column + scroll body `max-height: min(75dvh, 560px)` |

Dismiss threshold unchanged (**96px**). Escape / backdrop / focus trap preserved. Touch targets on primary actions remain ≥44px (`min-h-12` / `min-h-14`).

---

## 5. Layout changes

- Sheet: flex column; title sticky-ish (shrink-0); body scrolls.
- Content (title, description, actions) remains fully present — no truncation of copy.
- Denied location sheet actions stay inside scrollable body so none sit under the viewport edge.

---

## 6. Mobile validation

| Check | Expected |
| --- | --- |
| Location educate / denied | Fully visible; scroll if needed; handle drag dismisses |
| App download sheet | Fully visible; actions tappable |
| Location fallback chip | Above customer tabs + home indicator |
| Customer tabs | Icons/labels not crushed by safe area |
| Offline banner | Top; unchanged |
| Android Capacitor / mobile web | Same shared BottomSheet |

---

## 7. Desktop validation

| Check | Expected |
| --- | --- |
| Sheets | Centered `max-w-lg` bottom sheet; mouse click backdrop closes |
| Customer md+ | Side rail; location banner uses `md:bottom-4` offsets |
| Offer/Pay footers | `md:pb-4` — no fake tab clearance |

---

## Accessibility

- Dialog labelling / focus trap retained.
- Handle has sr-only “Drag down to close”.
- Buttons keep large hit areas.
- Content not removed for space; overflow scrolls.

---

## Files modified

- `packages/ui/BottomSheet.tsx`
- `src/index.css` (sheet panel)
- `packages/shared/location/LocationPermissionHost.tsx`
- `packages/shared/location/LocationEducationSheet.tsx`
- `packages/shared/appDownload/AppDownloadSheet.tsx`
- `apps/customer/components/CustomerShell.tsx`
- `apps/customer/pages/OfferDetailPage.tsx`
- `apps/customer/pages/PayJobPage.tsx`
