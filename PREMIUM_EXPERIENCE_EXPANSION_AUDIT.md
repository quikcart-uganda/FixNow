# PREMIUM EXPERIENCE EXPANSION AUDIT

**Phase:** Audit only — no implementation  
**Date:** 2026-07-30  
**Scope:** Technician app experience beyond dashboards (Starter / Professional / Business)  
**Protected:** Entitlement engine · catalogue · payments · routes · navigation · auth · APIs · schema  

---

## 1. Executive verdict

**Dashboards are differentiated. Almost everything else is not.**

Outside Home, Starter / Professional / Business are **visually identical** on the main operational screens (Jobs, Active, Messages, Portfolio, Earnings, Profile, Availability, Reviews, Reputation, Settings, Help, Community). Progressive value mostly appears as:

1. **Dashboard composition** (already done)  
2. **AppShell labels** (plan subtitle / chip / AI FAB label)  
3. **Free vs paid lock gates** (apply / contact) — not Pro vs Business polish  
4. **Hide-only entitlement gates** on Marketing creatives and Marketing Centre  

A Business technician leaving the command-centre home lands in the **same** Jobs / Earnings / Portfolio chrome as Starter. Upgrade value does **not** travel with them through the app.

| Score (0–10) | Value | Reading |
|---|---|---|
| **Experience score** | **4.5** | Strong homes; weak elsewhere |
| **Visual maturity score** | **5.0** | Solid shared design system; little tier styling beyond Home |
| **Premium perception score** | **3.5** | Premium “feel” stops at dashboard exit |
| **Consistency score** | **3.0** | Dashboard promises ≠ rest of app delivery |
| **Business polish score** | **3.5** | Marketing Centre helps; company/team/earnings still Starter-like |

---

## 2. What already works

| Area | Status |
|---|---|
| Home routing Free / Starter / Pro / Business | Strong progressive UX |
| AppShell plan labels + AI assistant label | Light progressive cue |
| Upgrade / Plan detail / Subscription Centre / Billing | Correctly plan-aware |
| Marketing Centre lock for non-Business | Clear gate (hide + upgrade CTA) |
| Free lock banners / JobCard locked apply | Clear Free vs paid split |

---

## 3. Screen-by-screen audit

Legend: **Identical** = Starter/Pro/Business look the same · **Diff** = none | hide-only | light | strong  

### 3.1 Home

| | |
|---|---|
| **Route / files** | `/technician/dashboard` · `DashboardPage` + tier dashboards |
| **Starter simple?** | Yes |
| **Pro premium?** | Yes |
| **Business executive?** | Yes |
| **Identical?** | No |
| **Diff** | strong |
| **Rec** | Keep as reference pattern; expand themes outward |

---

### 3.2 Jobs

| | |
|---|---|
| **Route / files** | `/technician/jobs` · `JobsFeedPage.tsx`, `JobCard.tsx` |
| **Identical?** | **Yes** (paid) |
| **Diff** | hide-only (Free/locked vs paid) |
| **Findings** | Same filters, cards, density, empty/loading for all paid tiers. No priority strip, plan hero, or Business queue framing. |
| **Rec (P0)** | Wrap with `fn-theme-*`; tier header eyebrow; Pro “priority match” presentation; Business “demand board” density — same routes/APIs |

---

### 3.3 Job Details

| | |
|---|---|
| **Route / files** | `/technician/jobs/:id` · `JobDetailsPage.tsx` |
| **Identical?** | **Yes** (paid) |
| **Diff** | hide-only (`canApply` / locked) |
| **Findings** | Sticky apply bar and layout identical across paid tiers. |
| **Rec (P1)** | Soft plan badge; Pro match-insight callout; Business SLA/urgency presentation — presentation only |

---

### 3.4 Schedule (Availability)

| | |
|---|---|
| **Closest** | `/technician/availability`, `/service-areas` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | No plan badge, no peak-hours Pro chrome, no company calendar Business framing. |
| **Rec (P2)** | Tier page intro + denser Business “coverage” summary using existing fields |

---

### 3.5 Messages / Communication

| | |
|---|---|
| **Route / files** | `/messages`, `/messages/:id` · `MessagesPage`, `ChatPage` → shared inbox/thread |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | Same ConversationInbox / ChatThread for all plans. |
| **Rec (P1)** | Plan chip in inbox header; Business “company inbox” copy; Pro priority support hint — no new routes |

---

### 3.6 Notifications

| | |
|---|---|
| **Route / files** | `/notifications` · `NotificationsPage` → `NotificationsInbox` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Rec (P2)** | Optional urgency density / plan accent on list chrome |

---

### 3.7 Portfolio

| | |
|---|---|
| **Route / files** | `/portfolio` · `PortfolioPage.tsx` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | Full composers (photo/video/certificate/case study) shown regardless of plan; limits may be server-side only. Feels like Pro/Business even on Starter. |
| **Rec (P0)** | Plan-aware intro + locked-preview cards for kinds not entitled (look premium when locked, not “missing”); Business branded gallery hero using company colours |

---

### 3.8 Reviews / Ratings

| | |
|---|---|
| **Routes** | `/reviews`, `/reputation`, `/achievements` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | Trust/reputation UI shared; no plan linkage to visibility story. |
| **Rec (P1)** | Reputation page: plan visibility callout; Reviews: Pro “respond / improve” density; Business aggregate brand summary |

---

### 3.9 Customers

| | |
|---|---|
| **Named screen** | None |
| **Closest** | Job details, Active, Reviews |
| **Rec (P2)** | Business empty-state / summary chips on Active (“repeat customers”) using `repeatCustomerPct` — no CRM route |

---

### 3.10 Income / Wallet

| | |
|---|---|
| **Route / files** | `/earnings` · `EarningsPage.tsx` (wallet + payouts) |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | `trust-gradient` hero + StatCards identical; Business dashboard forecast does not appear here. |
| **Rec (P0)** | Tier theme + plan badge; Pro trend strip; Business “revenue desk” density (reuse ForecastWidget presentation) |

---

### 3.11 Analytics / Performance

| | |
|---|---|
| **Routes** | `/marketing`, `/marketing/analytics`, creatives/offers lifecycle |
| **Identical?** | **Mostly yes** among paid users with access |
| **Diff** | MarketingLayout **none**; Creatives **hide-only** by flags; Marketing Centre **hide-only** for non-Business |
| **Findings** | Marketing header always generic “Marketing”. Business Marketing Centre is stronger when unlocked, but `/marketing` does not feel executive. No dedicated Performance route. |
| **Rec (P0)** | Plan-aware MarketingLayout title/subtitle; denser analytics for Business; locked creative kinds as premium preview cards |

---

### 3.12 Documents / Verification

| | |
|---|---|
| **Named screens** | None dedicated |
| **Closest** | Portfolio certificates; `CompanyProfilePage` verification fields; Help CMS |
| **Identical?** | **Yes** where present |
| **Rec (P2)** | Company verification status chip themed for Business; certificate empty states plan-aware |

---

### 3.13 AI Assistant

| | |
|---|---|
| **Surface** | Shell `AiAssistantLauncher` (no `/ai` page) |
| **Identical?** | FAB/panel chrome yes; **label** differs |
| **Diff** | light |
| **Findings** | Backend prompts already adapt by plan; UI barely shows that. |
| **Rec (P1)** | FAB accent by `data-plan-tier`; panel header “Starter/Pro/Business Assistant” + one-line mode blurb |

---

### 3.14 Support

| | |
|---|---|
| **Routes** | `/help`, `/guarantee` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Rec (P2)** | Priority support presentation for Pro/Business (copy + badge) without new routing |

---

### 3.15 Settings / Profile

| | |
|---|---|
| **Routes** | `/settings`, `/profile`, `/profile-setup`, `/services` |
| **Identical?** | **Yes** |
| **Diff** | none |
| **Findings** | Profile always offers Upgrade CTA even for Business; no plan badge on profile hero. |
| **Rec (P0)** | Profile plan badge + tier-aware upgrade CTA (manage vs upgrade); Settings subscription row shows current plan |

---

### 3.16 Availability / History / Reports

| Requested | Closest | Identical? | Rec |
|---|---|---|---|
| Availability | Covered above | Yes | P2 theme intro |
| History | Earnings ledger, Boost history, marketing lists | Yes | P2 plan accents on list headers |
| Reports | Marketing analytics | Yes | Fold into Analytics P0 |

---

### 3.17 Other notable screens

| Screen | Diff | Identical paid? | Rec |
|---|---|---|---|
| Active / Assigned / Complete | hide-only / none | Yes | P1 Active: plan strip; Business ops framing |
| Boosts | light (`eligibilityPlan` text) | Yes | P1 styled eligibility states |
| Community / Referrals | none | Yes | P3 low priority accents |
| Company profile | none (server-gated copy) | Yes | P1 Business theme + brand preview |
| Team placeholder | light copy | N/A | Keep; polish executive empty state |
| Locked | Free-exhaustion UX | N/A | Keep Free-specific |
| Upgrade / Subscription / Billing | strong | No | Already good — protect |

---

## 4. Cross-cutting findings

### Shared layouts that should progressively improve

| Shared surface | Today | Opportunity |
|---|---|---|
| AppShell `data-plan-tier` | Sets unused `--fn-plan-accent` | Drive page washes, FAB, section eyebrows |
| `fn-theme-*` / premium widgets | Dashboard-only | Wrap Jobs, Earnings, Portfolio, Marketing, Profile |
| `SubscriptionBadge` | Subscription flows only | Profile, Earnings, Marketing headers |
| MarketingLayout | One generic studio | Tier titles + density without new nav |
| Empty / loading states | Generic `AsyncStateView` | Plan-aware empty copy and card polish |
| Micro-interactions | Dashboard motion richer | Extend `.fn-pressable` / enter animations to key lists |

### Missed opportunities (presentation only)

1. Leaving Home instantly loses tier identity.  
2. Portfolio/Marketing can look “fully unlocked” even when limits are Starter-grade.  
3. Business revenue intelligence exists on Home but not on Earnings.  
4. AI adapts in prompts but not in visible chrome.  
5. `planAccentCssVar` unused — theme plumbing incomplete outside Home.

### Premium features that do not look premium

- Marketing studio / analytics (capable, flat)  
- Portfolio video/certificate composers (no premium framing)  
- Boosts marketplace (functional list)  
- Company profile form (admin-like, not executive)

### Business features that still resemble Starter

- Earnings wallet page  
- Jobs feed  
- Messages  
- Profile  
- Settings  
- Availability  

---

## 5. What not to do (reaffirmed)

- Separate apps / navigation / routing trees  
- Duplicate entitlement engines or APIs  
- Redesign subscription catalogue or payments  
- New screens that require schema for “polish only”  

Prefer: **shared page shells + tier presentation props** driven by existing `entitlementPlanCode` / `resolvePlanWorkspaceTier`.

---

## 6. Implementation priority (next phases — not this audit)

### P0 — Highest impact (carry dashboard promise into daily work)

1. **Jobs feed** plan theme + header + paid identical → progressive  
2. **Earnings** plan theme + Business revenue presentation reuse  
3. **Portfolio** locked-preview for non-entitled kinds + Business brand hero  
4. **MarketingLayout** tier-aware title/density; creatives locked preview cards  
5. **Profile** plan badge + smart upgrade/manage CTA  

### P1 — Reinforce premium perception

6. Job details / Active jobs plan strips  
7. Messages header plan chip  
8. AI FAB/panel accent + mode blurb  
9. Reputation / Reviews plan callouts  
10. Company profile executive framing  
11. Boosts eligibility presentation  

### P2 — Polish & consistency

12. Availability / service areas intro  
13. Notifications chrome  
14. Help priority-support presentation  
15. Empty/loading state copy pass across AsyncStateView usages  

### P3 — Nice-to-have

16. Community / Referrals accents  
17. Achievements plan-linked celebration  

---

## 7. Files likely affected (future presentation work)

| File / area | Why |
|---|---|
| `apps/technician/components/layout/AppShell.tsx` | Consume `--fn-plan-accent` more fully |
| `apps/technician/lib/planWorkspace.ts` | Shared helpers already exist |
| `apps/technician/pages/JobsFeedPage.tsx` + `components/jobs/JobCard.tsx` | P0 Jobs |
| `apps/technician/pages/JobDetailsPage.tsx` | P1 |
| `apps/technician/pages/ActiveJobsPage.tsx` | P1 |
| `apps/technician/pages/EarningsPage.tsx` | P0 Income |
| `apps/technician/pages/PortfolioPage.tsx` | P0 |
| `apps/technician/pages/marketing/MarketingLayout.tsx` | P0 |
| `apps/technician/pages/marketing/MarketingCreativesPage.tsx` | P0 locked previews |
| `apps/technician/pages/marketing/MarketingAnalyticsPage.tsx` | P0 density |
| `apps/technician/pages/MarketingCentrePage.tsx` | Align Business polish |
| `apps/technician/pages/ProfilePage.tsx` | P0 badge/CTA |
| `apps/technician/pages/SettingsPage.tsx` | Current plan row |
| `apps/technician/pages/AvailabilityPage.tsx` | P2 |
| `apps/technician/pages/ReviewsPage.tsx` / `ReputationPage.tsx` | P1 |
| `apps/technician/pages/BoostMarketplacePage.tsx` | P1 |
| `apps/technician/pages/CompanyProfilePage.tsx` | P1 |
| `apps/technician/pages/MessagesPage.tsx` / Chat wrappers | P1 |
| `packages/shared/AiAssistantLauncher.tsx` (+ panel header) | P1 accent |
| `apps/technician/components/dashboard/PremiumDashboardWidgets.tsx` | Reuse widgets off-home |
| `src/index.css` | Extend theme utilities off dashboard |

**Do not touch for polish:** entitlement services, subscription.service payment paths, routes.tsx destination lists, auth middleware, backend schemas.

---

## 8. Recommended expansion strategy

1. **Extract a thin `PlanWorkspaceShell`** (presentation): applies `fn-theme-*`, optional eyebrow, optional `SubscriptionBadge` — wrap existing pages.  
2. **Reuse dashboard widgets** (ForecastWidget, TrendSparkline, PriorityJobsList) on Earnings / Jobs where data already exists client-side.  
3. **Locked-preview pattern** for Portfolio/Marketing kinds: show the control, disabled, with “included in Professional/Business” — looks premium, same APIs.  
4. **Validate with Development Subscription Simulator** on each wrapped screen (Starter → Pro → Business without restart).  

---

## 9. Out of scope (this phase)

- No code changes  
- No navigation redesign  
- No subscription / entitlement / API changes  

---

*End of audit.*
