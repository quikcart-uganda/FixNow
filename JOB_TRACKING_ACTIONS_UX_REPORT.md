# Job Tracking Actions UX Report

**Screen:** Customer Job Tracking (`/customer/tracking/:id`)  
**Scope:** Visual redesign only — no API, navigation, state, or lifecycle changes  
**Date:** 2026-07-26

---

## Summary

The Live Status action area was rebuilt from a cramped `flex-wrap` button cluster into a structured card: status/meta badges, contextual actions, and a dedicated primary/secondary navigation row that stacks on narrow phones and sits side-by-side from `sm` (≥640px).

---

## Before / After

| Aspect | Before | After |
|--------|--------|-------|
| Layout | All actions in one wrapping row (`h-11`, `flex-1`) | Separated: meta badges → contextual grid → nav row |
| Primary action | Same outline style as secondary | FixNow gradient fill, white icon/text, medium shadow |
| Secondary action | Same outline style as primary | Outlined, white fill, primary border/text |
| Labels | “View applications” (wrap-prone) | **View Offers** (matches tracker step “Offers”) |
| Secondary label | “All jobs” | **All Jobs** + `work` icon |
| Touch target | ~44×44 (`h-11`) | **56px** height / **min 52px** (≥48dp) |
| Radius | `rounded-lg` (~8px) | `rounded-2xl` (16px) |
| Icons | 18px | 20–22px |
| Live status meta | Plain text lines | Badge chips: location, budget, escrow + status pill |
| Hierarchy | Flat — every button equal | Clear primary vs secondary vs soft/danger |

### Chosen wording

**View Offers** — aligns with the existing job-step label “Offers” and customer mental model (technicians offering to take the job). Route unchanged: `/customer/jobs/:id/applications`.

---

## Components modified

| File | Change |
|------|--------|
| `apps/customer/pages/JobTrackingPage.tsx` | Live Status card + action styles only |

**Unchanged:** handlers (`openChat`, `requestRefund`, `openDispute`), routes, `useAsync` / realtime hooks, escrow logic, `LiveTrackingPanel`, reviews, APIs.

### Style tokens added (page-local)

- `ACTION_BASE` — 52–56px, radius 16px, press scale, focus ring, disabled
- `ACTION_PRIMARY` — gradient `from-primary` → `to-primary-container`
- `ACTION_SECONDARY` — outlined primary
- `ACTION_SOFT` / `ACTION_DANGER` — contextual chat/pay/refund/dispute

### Helpers added (presentation only)

- `liveStatusLabel()` — e.g. Open → “Receiving Offers”
- `liveStatusTone()` — badge color by status

---

## Responsive behavior

| Breakpoint | Action row | Contextual actions | Meta badges |
|------------|------------|--------------------|-------------|
| Narrow phone (`< sm`) | Stacked full-width (Option A) | 1-column grid | Stacked chips |
| Large phone / tablet (`sm+`) | Side-by-side equal flex (Option B) | 2-column grid | Wrap row |
| Desktop | Same as `sm+`; shell `md:pl-20` unchanged | Same | Same |

**AI Assistant:** Customer shell already applies `pb-24` on `<main>`; action row uses full-width cards with no absolute positioning — no FAB overlap introduced.

**Text:** `whitespace-nowrap` on action controls; badge labels use `truncate` inside chips to avoid clipping.

### Responsive screenshots

Capture in device lab / browser DevTools for QA sign-off:

1. **Android ~360px** — stacked View Offers / All Jobs  
2. **iPhone ~390px** — stacked, status badge visible  
3. **Large phone / tablet ~768px** — side-by-side actions  
4. **Desktop ≥1024px** — side-by-side with rail padding  

*(Screenshots not embedded in-repo; verify visually against this checklist.)*

---

## Accessibility improvements

- Touch targets ≥48dp (controls are 56px tall)
- High-contrast primary gradient on white card; secondary uses primary border on white
- Status badge uses `aria-live="polite"`
- Nav region labeled `aria-label="Job navigation"`
- Links/buttons have descriptive `aria-label`s
- Escrow actions expose `aria-busy` + disabled opacity while busy
- Focus-visible outline on all action controls
- Icons decorative (`Icon` sets `aria-hidden`)
- Readable 15px semibold labels; no multi-line button text

---

## Micro-interactions

| State | Behavior |
|-------|----------|
| Press | `active:scale-[0.98]` + brightness |
| Hover (web) | Primary: brightness + stronger shadow; Secondary: soft primary fill |
| Ripple (Android WebView) | Native tap highlight suppressed; scale press provides feedback (no MDC ripple dependency) |
| Disabled | `opacity-50`, no press scale, `pointer-events-none` |
| Loading | Escrow refund/dispute show “Working…” + `aria-busy` (existing `escrowBusy`) |

---

## Regression verification

Confirm **unchanged** behavior:

- [ ] `View Offers` → `/customer/jobs/:jobId/applications`
- [ ] `All Jobs` → `/customer/jobs`
- [ ] Open chat still calls `messagesApi.ensureForJob` then navigates to messages
- [ ] Pay / escrow link still `/customer/payments/pay/:jobId`
- [ ] Request refund / Open dispute still call existing payment APIs + prompts
- [ ] Visibility gates unchanged (`canChat`, status checks, `escrowActive`)
- [ ] Job steps, live map panel, reviews still render as before
- [ ] No new network calls from the action UI

Visual QA:

- [ ] No button text wrapping on 320–430px widths
- [ ] No overlap with Ask FixNow FAB
- [ ] Status / location / budget badges align cleanly
- [ ] Primary/secondary contrast clear in light theme

---

## Safety checklist

| Constraint | Status |
|------------|--------|
| No backend changes | ✅ |
| No state management changes | ✅ |
| No job lifecycle changes | ✅ |
| No offer workflow changes | ✅ |
| No API contract changes | ✅ |
| Navigation paths preserved | ✅ |
| UI layer only | ✅ |
