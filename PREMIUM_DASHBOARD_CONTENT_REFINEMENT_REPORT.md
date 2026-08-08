# Premium Dashboard Content Refinement Report

**Date:** 2 August 2026  
**Scope:** Professional & Business technician dashboards and related premium page intros  
**Constraint:** Content / presentation only — no feature removal, routing, entitlements, subscriptions, or API behaviour changes.

---

## 1. Summary

Professional and Business homes were differentiated structurally, but much of the copy still read like internal product marketing (“you upgraded”, “not the Starter home”, “Intelligence Feed”, “Cashflow”, “Funnel energy”). Copy was rewritten so premium value is felt through tools and workflow, not repeated plan advertising.

---

## 2. Design principle applied

Technicians care about finding work, winning jobs, getting paid, staying visible, and managing customers. Titles and tips now use that language. Plan names appear only where useful as quiet status (sidebar plan chip, Business hero badge), not in every heading.

---

## 3. Before / after — Professional Dashboard

| Area | Before | After | Reason |
|------|--------|-------|--------|
| Hero badge | Professional + Premium productivity | Your workspace | Welcome, don’t advertise the SKU |
| Verified badge | Verified Professional | Verified | Shorter, less plan-repetitive |
| Hero title | Ron, you upgraded | Welcome back, Ron. | Welcome, not upsell echo |
| Hero body | Denser insights… this is not the Starter home. | Contextual: jobs nearby / what’s happening today | Remove Starter comparison & jargon |
| Hero CTA | Marketing studio | Marketing | Plain language |
| Section | Analytics / Performance at a glance / Richer than Starter — built for conversion | Overview / Your performance / Monitor how customers find and hire you | Natural goals |
| Trend label | Engagement trend | Activity trend | Less marketing |
| Plan days | 33 days on Professional | 33 days remaining on your plan | No plan name shout |
| Income card | Income insights / Professional connects money and momentum | Income / See what you earned… | Practical |
| Rating card | Portfolio insights / convert Professional visibility | Customer rating / Keep portfolio… | Practical |
| Marketing card | Marketing inventory / Create creative / Pending approvals | Your marketing / Create ad / Pending review | Technician language |
| AI title | Advanced AI suggestions | Suggestions for you | Drop “Advanced AI” |
| AI tip (response) | Push response rate toward 85%+ to convert more premium visibility… | Reply quickly to new enquiries… | Practical |
| AI tip (nearby) | …while Professional visibility is working for you | …reply quickly to improve your chances… | No plan boast |
| Quick actions title | Advanced quick actions | Quick actions | Drop “Advanced” |
| Sub: Intelligence feed | → Find work nearby | Natural |
| Sub: Proof that sells | → Show your work | Natural |
| Label/sub: Offers & analytics / Performance hub | → Offers / Track customer interest | Natural |
| Label/sub: Income summary / Cashflow | → Income / Earnings & payouts | Natural |
| Label/sub: Reputation / Trust trajectory | → Customer rating / Build trust | Natural |
| Label/sub: Premium profile / Brand presence | → Business profile / Your public page | Natural |

---

## 4. Before / after — Business Dashboard

| Area | Before | After | Reason |
|------|--------|-------|--------|
| Hero chip | Executive workspace | Company workspace | Less buzzword |
| Hero title | {Company} command centre | Welcome back, {Company}. | Welcome |
| Hero body | Luxury operations… step above Professional… | Track revenue, campaigns, customer growth… | Executive via tools, not comparison |
| Section | Command centre / Executive KPIs / Business-grade density… | Overview / Business performance / Revenue, customers, and visibility… | Meaningful |
| KPI | Customer retention / Company rating / Market visibility | Repeat customers / Customer rating / Visibility | Clear metrics |
| Forecast | Revenue intelligence | Revenue | Clear |
| Growth card | Momentum board / Funnel energy | Customer growth / Activity trend | Clear |
| Customers card | Customer analytics / executive levers… | Customers / Track ratings… | Clear |
| Chart | Marketing intelligence | Marketing performance | Clear |
| Portfolio | Portfolio analytics / Portfolio studio | Portfolio / Open portfolio | Clear |
| Campaigns | Marketing Centre usage | Campaigns / Open marketing | Clear |
| Timeline | Operational timeline / Marketing pipeline / Field operations | Today's activity / Marketing / Active work | Clear |
| AI | Executive AI insights + campaign OS jargon | Suggestions for you + weekly campaign review tip | Practical |
| Quick actions | Priority management / Cashflow desk / Field demand | Quick actions / Income & payouts / Find and apply / Team activity | Clear |

---

## 5. Shared widgets (`PremiumDashboardWidgets.tsx`)

| Before | After |
|--------|-------|
| Priority job intelligence / Ranked opportunities / Open feed | Priority jobs / Best matches near you / View all |
| Operational timeline / Live signals… | Today's activity / Updates from jobs and marketing |
| Revenue intelligence / Offer bookings / Ops pace | Revenue / Bookings / Pace |
| Technician performance | Your performance |

---

## 6. Workspace intros & empty states (`planWorkspace.ts`)

Professional/Business page intros and empty-state copy rewritten to remove:

- Cashflow, premium visibility, conversion, executive, intelligence, CMS, Starter comparisons, “Professional workspace” eyebrows

Eyebrow is now simply **Workspace** (not “Professional workspace”). Shell subtitles: **Your workspace** / **Company workspace**.

---

## 7. Related surfaces (same principle)

| Screen | Change |
|--------|--------|
| App header (mobile) | `PROFESSIONAL · RISING` → reputation level only (`Rising`) |
| App header (desktop) | `Professional workspace · Trust…` → `Workspace · Trust…` |
| Job card / Job details | Executive insight / AI profitability cue → Job insight / Job tip / Match tip |
| Profile badges | Executive identity / Pro presence → Company / Verified |
| Earnings tip | Executive tip / cashflow → Tip / balance stays predictable |
| Backend tips | Professional plan includes higher search visibility… → Keeping your profile active helps customers find you. |

---

## 8. Screens affected

- Professional Dashboard (home)
- Business Dashboard (home)
- Shared premium widgets
- Plan workspace intros / empty states (jobs, earnings, portfolio, profile, marketing, messages, reputation, reviews, availability, settings, boosts, company)
- App shell header subtitle
- Job list cards & job details (premium insight labels)
- Profile badges
- Earnings tip line
- Dashboard tip strings from marketing service (copy only)

Web and Android stay synchronized (same technician app package).

---

## 9. Intentionally unchanged

| Item | Why |
|------|-----|
| Layout, gradients, KPI cards, charts, links | No redesign / no feature removal |
| Routes and entitlement gating | Out of scope |
| Analytics numbers and data bindings | Unchanged |
| Sidebar “Professional plan” / “Business plan” chip | Quiet plan status for navigation |
| Starter dashboard structure | Not in this premium-content pass (only shared empty-copy polish) |
| Reputation level names (Rising, Trusted, …) | Product gamification labels, not plan marketing |

---

## 10. Validation

| Check | Status |
|-------|--------|
| No “you upgraded” / “not the Starter home” | Pass |
| No Intelligence Feed / Performance Hub / Cashflow / Brand Presence / Trust Trajectory | Pass |
| No repeated Premium Productivity / Advanced AI / Executive OS jargon on homes | Pass |
| Hero welcomes the technician | Pass |
| AI tips are practical | Pass |
| Business feels executive via tools (revenue, campaigns, team, growth) | Pass |
| Features, routes, entitlements unchanged | Pass |
| Web + Android share copy | Pass |

---

## 11. Files modified

- `apps/technician/pages/ProfessionalDashboardPage.tsx`
- `apps/technician/pages/BusinessDashboardPage.tsx`
- `apps/technician/components/dashboard/PremiumDashboardWidgets.tsx`
- `apps/technician/lib/planWorkspace.ts`
- `apps/technician/components/layout/AppShell.tsx`
- `apps/technician/pages/JobDetailsPage.tsx`
- `apps/technician/pages/ProfilePage.tsx`
- `apps/technician/pages/EarningsPage.tsx`
- `apps/technician/components/jobs/JobCard.tsx`
- `backend/src/services/marketing/technicianMarketingCreative.service.ts` (tip strings only)
- `PREMIUM_DASHBOARD_CONTENT_REFINEMENT_REPORT.md` (this file)
