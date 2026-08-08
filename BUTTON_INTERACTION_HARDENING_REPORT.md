# Button Interaction Hardening Report

**Date:** 2026-07-30  
**Scope:** UX polish only — press, loading, disabled, and recovery feedback across shared interactive controls. No branding, layout, or visual redesign.

---

## Summary

FixNow controls previously felt “hard” because many one-off buttons (especially error recovery) had no pressed feedback and no busy/loading guard. Shared primitives and high-traffic recovery surfaces now communicate **tap received → work in progress → restored after failure**.

---

## Components audited

| Area | Component / surface | Prior state | Action |
|------|---------------------|-------------|--------|
| Shared primitive | `packages/ui/Button.tsx` | Press scale only; no `busy` | Added busy spinner, `aria-busy`, focus ring, stronger press |
| Admin primitive | `apps/admin/components/ui.tsx` `Button` | Light press; no busy | Matched busy + press + focus |
| Error page | `packages/shared/AppErrorBoundary.tsx` | Plain Try again / Refresh | Press + Trying… / Refreshing… + double-tap lock |
| Boot failure | `src/main.tsx` `BootFailure` | Plain reload button | Press + Trying… + unlock timeout |
| Async sections | `packages/shared/AsyncStateView.tsx` | Try again / Refresh without busy | `BusyActionButton` with spinner + unlock |
| Auth | `AuthSubmitButton`, `authUx` classes, `ResendCodeButton` | Partial busy | Stronger press; OTP resend spinner |
| Auth | `ContinueWithGoogleButton` | Already had busy | Inherited stronger `authAction*` press |
| Dialogs | `MarkWorkCompleteDialog` | Manual label swap | Uses `Button` `busy` / `busyLabel` |
| Native | `NativeErrorHost` | Focus only | Press + `interactive-control` |
| Cards | `packages/ui/Card.tsx` `StatCard` | Hover/focus only | Active scale on clickable cards |
| Global CSS | `.press-effect`, `.interactive-control` | Basic scale | Faster press + opacity; reduced-motion |

Also reviewed (already adequate or inherited via primitives): header notification/status controls, AI FAB/composer send, location permission host, app download reminder host, auth Google flow.

---

## Interaction improvements applied

### Pressed state
- Scale **~97%** + slight opacity drop on active (`active:scale-[0.97] active:opacity-90`).
- `touch-manip` and `-webkit-tap-highlight-color: transparent` for native/web tap feel.
- Transitions ~**100ms** so feedback lands in the same gesture frame.
- `motion-reduce` / CSS `prefers-reduced-motion` disables transform on shared utilities.

### Hover (desktop)
- Unchanged product colors; existing hover backgrounds retained on primary/secondary/auth actions.

### Focus
- Visible `focus-visible` outline on shared Button, admin Button, error recovery, async retry, auth actions, OTP resend.

### Disabled
- Opacity + `disabled:active:scale-100` so disabled controls do not fake a press.
- Busy controls use `cursor-wait` / reduced opacity and block further activation.

---

## Loading state improvements

| Control | Busy label | Duplicate-tap prevention | Failure recovery |
|---------|------------|--------------------------|------------------|
| Error **Try again** | Trying… + spinner | `disabled` + busy flag | Re-enables ~900ms if boundary stays mounted |
| Error **Refresh** | Refreshing… + spinner | Same (mutual lock with Try again) | Re-enables ~5s if reload blocked |
| Boot **Try again** | Trying… | Busy lock | Unlock after 5s if reload fails |
| Async **Try again** | Trying… | Busy lock | Unlock after ~600ms |
| Async empty **Refresh** | Refreshing… | Busy lock | Unlock after ~600ms |
| Shared / admin `Button` | `busyLabel` (optional) | `disabled` when `busy` | Caller clears `busy` |
| Auth submit / Google / OTP | Existing busy labels | Existing guards + press polish | Existing `finally` / unlock paths |

Success path for error **Try again** typically unmounts the fallback when `reset()` clears `hasError`. Refresh navigates away on successful reload.

---

## Accessibility review

- Minimum touch targets retained (`tap-target` / `min-h-11` / Button size tokens).
- Keyboard: native `<button>` / `<Link>`; focus-visible rings preserved.
- Screen readers: `aria-busy` on busy actions; spinners `aria-hidden`.
- Contrast: existing primary/on-primary and outline treatments unchanged.
- Reduced motion respected on `.press-effect`, `.interactive-control`, and shared Button.

---

## Performance review

- Feedback uses CSS transform/opacity (compositor-friendly); no layout thrash.
- Busy paint scheduled with `requestAnimationFrame` before reset/reload so the UI acknowledges the tap before sync work.
- No artificial delays on the happy path beyond paint scheduling.
- Unlock timers only run when the control remains mounted (failed recovery).

---

## Validation results

| Check | Result |
|-------|--------|
| Immediate tap feedback on shared/admin buttons | ✓ Press scale + opacity |
| Async actions show loading where hardened | ✓ Error page, boot, AsyncStateView, Button `busy`, auth |
| Duplicate taps prevented | ✓ Busy/`disabled` guards |
| Buttons recover after errors | ✓ Unlock timers / caller `finally` |
| Error page Try again / Refresh feel responsive | ✓ Hardened in `AppErrorBoundary` |
| Consistent Web / Android / iOS (Capacitor WebView) | ✓ Same CSS/React primitives; touch-action + tap-highlight |

**Manual spot-check recommended:** trigger a section error boundary (or temporary throw), tap Try again / Refresh; confirm spinner labels and that a second tap does nothing until unlock/reload.

---

## Files changed

- `packages/ui/Button.tsx`
- `packages/ui/Card.tsx`
- `packages/shared/AppErrorBoundary.tsx`
- `packages/shared/AsyncStateView.tsx`
- `packages/shared/auth/authUx.ts`
- `packages/shared/auth/AuthSubmitButton.tsx`
- `packages/shared/auth/OtpInput.tsx`
- `packages/shared/jobs/MarkWorkCompleteDialog.tsx`
- `packages/native/NativeErrorHost.tsx`
- `apps/admin/components/ui.tsx`
- `src/main.tsx`
- `src/index.css`
- `BUTTON_INTERACTION_HARDENING_REPORT.md` (this file)

---

## Follow-ups (optional, out of scope)

- Migrate remaining one-off `<button className="bg-primary…">` call sites to `@fixnow/ui` `Button` with `busy`.
- Wire payment/admin mutation CTAs that still swap label text manually to the shared `busy` prop for consistency.
- Platform-native ripple on Android Capacitor would require native plugin work; WebView CSS press remains the cross-platform baseline.
