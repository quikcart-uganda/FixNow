# PREMIUM DASHBOARD EXPERIENCE REPORT

**Date:** 2026-07-30  
**Phase:** Progressive Starter / Professional / Business workspace enhancement  
**Constraint:** Entitlement engine unchanged · Navigation structure unchanged · One application

---

## 1. Summary

Technician home dashboards now progress clearly by plan:

| Tier | Home identity | Instant upgrade feel |
|---|---|---|
| **Free** | Marketplace / quota home (unchanged role) | — |
| **Starter** | Dedicated clean Starter workspace | **Yes** vs Free |
| **Professional** | Richer analytics + job priority + insights | **Yes** vs Starter |
| **Business** | Executive command centre + BI widgets | **Yes** vs Professional |

Shell branding, header subtitle, sidebar plan badge, and AI launcher label now reflect the active plan — **without** changing nav item lists or routes.

---

## 2. Starter improvements

**New:** `apps/technician/pages/StarterDashboardPage.tsx`

- Distinct light Starter hero (plan badge, unlimited-apply signal, primary CTAs)
- Essential KPI row only (Available, Active, Rating, Weekly income)
- Lean trust + plan benefits card
- Four focused quick actions (jobs, active, portfolio, availability)
- Minimal “recent signal” — no marketing rails / tip trios / sponsored clutter
- Pull-to-refresh + realtime job sockets preserved

**Routing:** `DashboardPage` routes paid `STARTER` (and other paid non-Pro/Business) here; Free stays on `FreeDashboardHome`.

---

## 3. Professional improvements

**Updated:** `apps/technician/pages/ProfessionalDashboardPage.tsx`

- Stronger premium hero (“your upgraded workspace”)
- **Jobs attention strip** (nearby + in-progress + priority CTA) — keeps field productivity
- Expanded premium KPIs (offers, ads, income)
- Performance snapshot + marketing inventory
- **Smarter recommendations** derived from live marketing/job/profile signals + server tips
- Six workflow shortcuts (jobs, portfolio, marketing, earnings, reputation, profile)
- Premium surface treatments + staggered enter motion

---

## 4. Business improvements

**Updated:** `apps/technician/pages/BusinessDashboardPage.tsx`

- Executive hero with **company brand accent** (`brandPrimaryColor`) in the gradient
- “Command Centre” badge language
- **Executive KPIs:** weekly revenue, retention, rating, visibility
- **Marketing intelligence** CSS bar chart (no heavy chart library)
- Growth posture + reputation analytics panels
- **Operational timeline** + advanced recommendation list
- Priority management shortcuts (jobs, revenue, rating, team)
- Executive card surfaces and teal-accented polish

---

## 5. Visual enhancements

| Area | Change |
|---|---|
| Plan themes | `data-plan-tier` on shell + CSS tokens (`--fn-plan-*`) |
| Premium cards | `.fn-premium-surface`, `.fn-executive-surface`, KPI tone variants |
| Motion | `.fn-dash-enter`, `.fn-bar-fill`; reduced-motion respected |
| Shell | Plan subtitle, plan chip, paid sidebar (no free-meter when subscribed) |
| Header | Plan-aware mobile/desktop captions |
| AI FAB label | Starter / Pro / Business Assistant (same launcher, label only) |

Shared widgets: `apps/technician/components/dashboard/PremiumDashboardWidgets.tsx`  
Plan helpers: `apps/technician/lib/planWorkspace.ts`

---

## 6. Performance review

- No new charting dependencies — CSS bars only  
- Pro/Business reuse existing `professionalDashboard` + lightweight job list/nearby calls  
- Failed job fetches degrade gracefully (empty arrays)  
- Starter omits marketing delivery queries used on Free home  
- Enter animations are CSS-only and disabled under `prefers-reduced-motion`  
- Navigation lists unchanged (no extra route graph)

---

## 7. Accessibility review

- KPI / strip / quick links use real `<Link>` / buttons with focus rings  
- Timeline and charts expose labels / `aria-label` where useful  
- Touch targets keep `min-h-10` / `min-h-11` patterns  
- Contrast: light surfaces with primary/teal accents; hero text on dark gradients  
- Reduced motion: plan workspace animations suppressed  

---

## 8. Validation checklist

| Check | Status |
|---|---|
| Starter remains simple and efficient | ✓ Dedicated lean home |
| Professional immediately feels upgraded | ✓ Premium hero + KPIs + insights |
| Business immediately feels premium | ✓ Command centre + executive widgets |
| Navigation remains familiar | ✓ Same desktop/mobile nav items & routes |
| Entitlements unchanged | ✓ Display-only; no engine edits |
| Existing functionality preserved | ✓ Jobs, marketing, subscription routes intact |
| AI respects plan capabilities | ✓ Label only; capability gating still server-side |
| Android / Web visual consistency | ✓ Shared React + CSS tokens (Capacitor webview) |

---

## 9. Files touched

- `apps/technician/pages/DashboardPage.tsx` — plan router + Free home extract  
- `apps/technician/pages/StarterDashboardPage.tsx` — **new**  
- `apps/technician/pages/ProfessionalDashboardPage.tsx`  
- `apps/technician/pages/BusinessDashboardPage.tsx`  
- `apps/technician/components/layout/AppShell.tsx`  
- `apps/technician/components/dashboard/PremiumDashboardWidgets.tsx` — **new**  
- `apps/technician/lib/planWorkspace.ts` — **new**  
- `src/index.css` — plan theme + motion utilities  

**Not modified:** entitlement services, subscription catalogue, route tree shape, bottom/desktop nav destinations.

---

## 10. Out of scope / follow-ups

- Team/dispatch remains placeholder (Business link preserved)  
- True revenue forecasting would need historical series APIs (current widgets use live profile + marketing counts)  
- Deeper theming of every secondary screen (Jobs/Inbox) can follow the same `data-plan-tier` tokens later  

---

*Implementation complete: users can instantly recognize upgrade value through progressively richer dashboard experiences while FixNow remains one application with the same navigation and entitlement architecture.*
