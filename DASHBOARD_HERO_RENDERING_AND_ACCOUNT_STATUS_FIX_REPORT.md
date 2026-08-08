# DASHBOARD_HERO_RENDERING_AND_ACCOUNT_STATUS_FIX_REPORT

## Summary

Fixed blank Business/Professional hero KPI cards and the mobile header flash that showed a wrong progress tag (e.g. “Rising”) before subscription state was ready. Plan and progress labels are now separated; the shell waits for quota/profile readiness before showing either.

---

## Defects addressed

| Issue | Root cause | Fix |
|-------|------------|-----|
| Blank white KPI cards (nav still worked) | Nested / interrupted `fn-dash-enter` opacity animation left content at `opacity: 0` | Outer-only enter animation on KPI shells; base + reduced-motion `opacity: 1` fallback in `src/index.css` |
| Header flashed “Rising” / wrong package feel | Mobile tag used reputation `profile.level`; mapper defaulted missing rank to Rising; quota not ready yet | Gate tag on `subscriptionReady` + `profileLoading`; paid → plan label; free → progress level; placeholder `…` / “Loading workspace…” until ready |
| Plan confused with progress | Same chip served both meanings | Paid accounts show plan (`planWorkspaceLabel`); free accounts show refined reputation ladder only |

---

## Files changed

| Area | Path |
|------|------|
| Hero widgets | `apps/technician/components/dashboard/PremiumDashboardWidgets.tsx` |
| Enter animation | `src/index.css` (`.fn-dash-enter`, reduced-motion) |
| Shell / header | `apps/technician/components/layout/AppShell.tsx` |
| Hydration gate | `apps/technician/context/AppContext.tsx` (`subscriptionReady = quotaGate != null`) |
| Rank display map | `packages/api/mappers.ts` |
| Types | `packages/types/index.ts` (aspirational + legacy aliases) |
| Reputation ladder UI | `apps/technician/components/trust/Trust.tsx` |

---

## Plan vs progress

- **Plan** (paid, after ready): Starter / Professional / Business via `resolvePlanWorkspaceTier` + `planWorkspaceLabel`.
- **Progress** (free, after ready): `New Professional` → `Active` → `Trusted` → `Preferred` → `Top Performer` → `Elite Partner` (legacy Beginner/Rising/… mapped).
- **While loading:** never show a confident plan or progress tag.

Socket refresh also picks up reputation / payment / catalogue updates so the header stays aligned after billing or rank changes.

---

## Verification checklist

- [ ] Business dashboard: KPI labels and values visible (not blank white cards); taps still navigate.
- [ ] Professional dashboard: same.
- [ ] Cold load as Business: mobile subtitle shows plan (not Rising / Active) after load; no wrong flash.
- [ ] Cold load as free: subtitle shows progress level only after ready; `…` while loading.
- [ ] Sidebar plan chip only when `hasActiveSubscription && subscriptionReady`.
- [ ] Reputation ladder highlights the correct aspirational step.

---

## Out of scope (unchanged)

Dashboard layout/redesign, subscription entitlement logic, routing, and billing flows were not redesigned.
