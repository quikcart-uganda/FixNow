# SUBSCRIPTION EXPERIENCE AUDIT

**Phase:** Audit only — no implementation  
**Date:** 2026-07-30  
**Scope:** Technician dashboard & workspace experience across Free/Starter, Professional, and Business  
**Not in scope:** Subscription catalogue redesign, entitlement math changes, payment flows

---

## 1. Executive verdict

Plans do **not** share one identical dashboard — but the upgrade story is **uneven**.

| Transition | Immediate “I upgraded” feel? | Why |
|---|---|---|
| Free → **Starter** | **No** | Same home page as Free; only the quota card becomes a small “Current plan” chip |
| Starter → **Professional** | **Yes (home only)** | Distinct navy gradient hero + marketing performance home |
| Professional → **Business** | **Weak / partial** | Twin layout to Professional; charcoal/teal hero + company CTAs, but same widgets/API/card language |

**Shell, navigation, typography, card system, AI launcher, and most secondary screens are identical across plans.** Premium capabilities often unlock as *more of the same UI* (marketing caps, company form fields), not as a visibly premium workspace.

Would a technician immediately know they upgraded?

- **Starter:** Usually **no** — workspace still feels like Free / “Technician Pro.”  
- **Professional:** **Yes on first home paint** — then the rest of the app feels unchanged.  
- **Business:** **Maybe** if they notice “command centre” / Marketing Centre — otherwise Professional with different copy.

---

## 2. Current dashboards

### 2.1 Routing

`DashboardPage` is the home router:

```
paid + BUSINESS     → BusinessDashboardPage
paid + PROFESSIONAL → ProfessionalDashboardPage
everything else     → default “marketplace” dashboard (Free + Starter)
```

There is **no dedicated Starter dashboard component**. Paid Starter stays on the Free-shaped home with a subscription branch in one card.

### 2.2 Starter (and Free) — default home

**File:** `apps/technician/pages/DashboardPage.tsx`

**Identity:** Marketplace worker home — welcome line, trust, jobs, reputation.

**Layout (top → bottom):**

1. Welcome headline + nearby job count + `GuaranteeChip`  
2. `DeveloperPreviewBanner` / `ProfileCompletionBanner` / `SubscriptionReminderBanner`  
3. `TrustScoreHero` + plan/quota side card  
4. Stat grid: Available / Assigned / Completed / Rating  
5. Stat grid: Jobs Won / Earnings / Response Rate  
6. `ReputationLadder` + badges  
7. Optional `SponsoredHeroBanner`  
8. Quick Actions + Recent Activity  
9. `MarketingRails`  
10. CMS tips or static tip trio  

**Starter-only delta vs Free:** When `hasActiveSubscription`, the side card shows “Current plan” + plan code chip + renew CTA instead of `FreeJobsMeter` + Upgrade. Copy claims “Unlimited applications · Standard search ranking.” Everything else is shared with Free.

**Visual language:** Light surface, standard `Card` / `StatCard`, `animate-fade-up`, icon hover scale on quick actions. No plan-coloured hero. No premium elevation system beyond shared design tokens.

### 2.3 Professional dashboard

**File:** `apps/technician/pages/ProfessionalDashboardPage.tsx`

**Identity:** “Grow your business” marketing workstation.

**Distinctive elements:**

- Full-bleed **navy gradient hero** (`#0A2540` → `#1B5F7A`) with blur orb  
- Capsule badges: “Professional” / “Verified Professional”  
- CTAs: Marketing studio, Manage subscription  
- Cards: plan, search visibility label, pending approvals  
- Performance `StatCard`s: offer/ad views & clicks  
- Marketing inventory + engagement + tips  
- Quick links: jobs, portfolio, marketing, premium profile  

**Data:** `technicianMarketingApi.professionalDashboard()` + `subscriptionsApi.getMine()`.

**Missing vs Free home:** Nearby jobs feed summary, trust ladder, free-quota meter, earnings-this-week prominence, reputation badges strip, pull-to-refresh job realtime wiring (Pro home is marketing-centric).

### 2.4 Business dashboard

**File:** `apps/technician/pages/BusinessDashboardPage.tsx`

**Identity:** Declared “company management portal / mini service company OS.”

**Distinctive elements:**

- **Charcoal → teal gradient hero** (`#111827` → `#0F766E`)  
- Badges: “Business” / “Verified Business”  
- Headline uses `companyName` when present (“… command centre”)  
- CTAs: Marketing Centre, Company profile, Team (soon)  
- Four-up subscription / visibility / approvals row  
- “Business statistics” (same family as Pro metrics)  
- Marketing usage (includes announcements) + **Company overview** card  
- Portal links: Jobs, Revenue, Company rating, Team & dispatch  

**Data:** Same API as Professional (`professionalDashboard`) — not a separate business dashboard endpoint.

**Structural note:** Comment says “intentionally distinct,” but section skeleton, card density, tip lists, and quick-link patterns are **near-duplicates** of Professional with different labels/CTAs.

---

## 3. Comparison matrix

| Dimension | Free | Starter | Professional | Business |
|---|---|---|---|---|
| Dedicated home component | Default `DashboardPage` | **Same as Free** | `ProfessionalDashboardPage` | `BusinessDashboardPage` |
| Hero treatment | Plain welcome text | Plain welcome text | Navy gradient portal | Charcoal/teal gradient portal |
| Plan badge on home | Upgrade CTA / free meter | Small plan chip | “Professional” + verified | “Business” + verified |
| Trust / reputation home | Yes (`TrustScoreHero`, ladder) | Yes | No | No |
| Job discovery on home | Nearby count + quick actions | Same | Link only | Link only |
| Marketing performance widgets | No | No | Yes | Yes (same family) |
| Marketing Centre entry | No | No | Marketing studio | Marketing Centre hub |
| Company portal entry | Weak | Weak | Profile link | Company + Team CTAs |
| Shell / bottom nav | Shared | Shared | Shared | Shared |
| Sidebar brand line | “Technician Pro” | “Technician Pro” | “Technician Pro” | “Technician Pro” |
| Header subtitle | Reputation “Level Pro” | Same | Same | Same |
| AI launcher | “Pro Assistant” | Same | Same | Same |
| Visual theme by plan | No | No | Hero only | Hero only |
| Workspace personalization on chrome | No | No | No | Brand colours on **company form**, not app chrome |

---

## 4. Shared components

### Across all plans (shell + system)

| Component / pattern | Location |
|---|---|
| `AppShell` desktop + mobile nav | `apps/technician/components/layout/AppShell.tsx` |
| `PortalHeader` | shared |
| `AiAssistantLauncher` | shared — always “Pro Assistant” |
| Design tokens: `Card`, `StatCard`, `Button`, `Icon`, `Badge` | `@fixnow/ui` |
| Motion: `animate-fade-up` | page wrappers |
| `DeveloperPreviewBanner` | Free/Starter + Pro + Business homes |
| Routes for jobs, inbox, profile, earnings, etc. | same URLs for all |

### Shared between Professional & Business homes

| Shared | Notes |
|---|---|
| `AsyncStateView` load pattern | Identical |
| Gradient hero + badge + dual CTAs | Colour/copy differ |
| Plan / visibility / approvals cards | Layout nearly identical |
| Marketing performance `StatCard` row | Labels slightly remixed |
| Inventory usage lists | Business adds announcements |
| Tips list from same dashboard payload | Same |
| QuickLink / PortalLink card row | Same visual component pattern |
| API: `professionalDashboard()` | **Same endpoint** |

### Shared between Free & Starter homes

**Almost entire page** — trust, stats, reputation, quick actions, activity, marketing rails, tips. Only the plan/quota side card branches.

---

## 5. Unique components (by plan home)

### Unique to Free/Starter home

- `TrustScoreHero`, `GuaranteeChip`, `ReputationLadder`  
- `FreeJobsMeter` (Free) / Starter plan chip card  
- `ProfileCompletionBanner`, `SubscriptionReminderBanner`  
- `SponsoredHeroBanner`, `MarketingRails`  
- Nearby/assigned job queries + `PullToRefresh` + realtime job sockets  
- Free/Starter quick-action list (Nearby, Active, Portfolio, Community)  
- “Recent Activity” empty + job alert block  

### Unique to Professional home

- Navy “grow your business” hero  
- “Verified Professional” badge treatment  
- Marketing studio primary CTA  
- Offer clicks metric in primary stats  
- “Customer engagement” copy card  
- Quick links labelled “Premium profile”  

### Unique to Business home

- Charcoal/teal “command centre” hero  
- “Verified Business” badge  
- Marketing Centre / Company / Team hero CTAs  
- Company overview card (slogan, rating, jobs)  
- Announcements capacity in usage list  
- Portal links: Revenue, Company rating, Team & dispatch  
- Separate **Marketing Centre** page (`MarketingCentrePage`) — Business entitlement gated  

### Unique off-home (Business / Professional feature surfaces)

| Surface | Typical gate | Looks premium? |
|---|---|---|
| `/technician/marketing/*` | Pro+ capabilities | Standard marketing UI — capable, not “luxury” |
| `/technician/business/marketing-centre` | Business `marketingCentre` | Hub of same cards — clearer *role*, not new visual system |
| `/technician/business/company` | Plan permissions | Form page; brand colours stored, not applied to shell |
| `/technician/business/team` | Placeholder | “Soon” — not an executive ops console yet |

---

## 6. Visual experience audit

| Element | Finding |
|---|---|
| **Typography** | Shared type scale (`text-headline`, `text-title`, `text-caps`, …). Pro/Business use `text-display-mobile` in heroes only. |
| **Spacing** | Shared `space-y-6` page rhythm; Free home denser (more sections). |
| **Card styles** | Same `Card` / `StatCard` everywhere. No plan-specific elevation tiers. |
| **Colour** | Global primary/surface tokens. Plan colour only in Pro/Business **hero gradients** (hard-coded hex, not brand/theme tokens). |
| **Backgrounds** | Shell `bg-background` for all. No plan workspace backgrounds. |
| **Elevations** | Shared shadows (`shadow-float` on mobile nav). No premium glass/depth system. |
| **Animations** | `animate-fade-up` page enter; quick-action icon `group-hover:scale-110`; mobile tab `active:scale-95`. Same for all plans. |
| **Premium effects** | Limited to gradient heroes + amber/teal verified chips. No motion that signals tier. |
| **Header** | Always FixNow + reputation “Level Pro” (not plan name). Paid Starter/Pro/Business not reflected in header brand line. |
| **Quick actions** | Free/Starter: job-centric list. Pro/Business: marketing-centric link cards — different content, same chrome. |
| **Workspace feel** | Free/Starter = field tech marketplace. Pro/Business = marketing admin panel. Outside home, feel converges again. |

---

## 7. Value perception

### Would a technician immediately know they upgraded?

| Plan | Answer | Why |
|---|---|---|
| **Starter** | **No** | Same layout, same trust ladder, same stats, same quick actions; sidebar still shows free-job meter and “Upgrade Plan”; header still “Rising Level Pro” style reputation chrome; no Starter hero or workspace theme. |
| **Professional** | **Yes — on Home** | Different first screen (gradient + marketing KPIs). **Weak after leaving Home** — Jobs/Inbox/Profile/Earnings look like Free/Starter. |
| **Business** | **Unclear** | Feels like Professional with company language. Without noticing Marketing Centre / company CTAs, the jump from Pro is subtle. Team is “soon,” so executive promise is incomplete. |

### Root causes of weak Starter perception

1. No `StarterDashboardPage` — Starter inherits Free UX.  
2. Shell branding is permanently “Technician Pro” / “Pro Assistant” — dilutes paid tier meaning.  
3. Free-job meter remains in desktop sidebar for paid users.  
4. Entitlement upgrades (unlimited apply) are behavioural, not visual.  
5. Prior UX work humanised Subscription Centre copy but did not create tiered home identities for Starter.

---

## 8. Feature experience (does premium *look* premium?)

| Area | Experience across plans | Looks premium when unlocked? |
|---|---|---|
| **Job discovery** | Same Jobs feed for all | No — unlock is “can apply,” not a premium feed UI |
| **Job management** | Same Active Jobs | No |
| **Analytics** | Free: response/earnings stats on home. Pro/Business: marketing view/click stats | Moderately — still standard `StatCard`s |
| **Performance** | Pro/Business marketing inventory | Functional quotas, not polished ops dashboard |
| **Income** | Shared Earnings page | No plan skin |
| **Reputation** | Featured on Free/Starter home; de-emphasised on Pro/Business homes | Paradox: free home looks more “trust-premium” visually |
| **Portfolio** | Shared Portfolio route; video limits by plan | Feature gate, not visual tier |
| **Availability** | Shared | No |
| **AI** | Same launcher for all | Label already “Pro” — no Business executive assistant persona |
| **Scheduling** | Not a distinct dashboard productivity layer by plan | N/A |
| **Communication** | Same Inbox | No |
| **Priority / visibility** | Shown as humanised labels on Pro/Business cards | Copy-level, not visual priority chrome on job lists |
| **Marketing** | Studio (Pro) vs Centre (Business) | Business hub improves IA; visual system unchanged |
| **Company branding** | Colours saved on profile | **Not applied** to app theme — personalization incomplete |

**Verdict:** Premium features mostly **behave** as upgrades; they rarely **look** like a higher product tier outside the Pro/Business home heroes.

---

## 9. Themes & personalization

| Capability | Supported today? |
|---|---|
| Plan visual themes (Starter/Pro/Business skins) | **No** (hero colour only on Pro/Business) |
| Accent variations by plan | **Hard-coded** hero gradients only |
| Premium styling system | **No** dedicated token set |
| Workspace personalization | **Partial** — company brand colours on Business/Pro profile editor; **not** wired into shell/dashboard chrome |
| Dark / executive mode for Business | **No** (hero is dark; body returns to light shared surface) |

---

## 10. Productivity audit

| Factor | Free/Starter home | Professional | Business |
|---|---|---|---|
| **Dashboard efficiency** | Strong for field work (jobs + trust + actions) | Strong for marketers; weak for “what jobs need me now?” | Similar to Pro + company links |
| **Workflow speed** | Quick actions to jobs/active | Extra hop to jobs | Extra hop; Marketing Centre consolidates campaigns |
| **Information density** | Highest (many sections) | Medium (marketing KPIs) | Medium |
| **Quick access** | Job-first | Marketing-first | Company + marketing-first |
| **Automation** | None plan-specific on home | Tips list only | Tips + “Team soon” |
| **Shortcuts** | 4 quick actions | 4 quick links | 4 portal links |

**Gap:** Upgrading to Pro/Business **trades away** the job-centric productivity surface without replacing it with an equally strong ops console (no combined “jobs + marketing + revenue” executive board).

---

## 11. Premium experience scores

Scores are **experience / perception** (0–10), not entitlement completeness.

| Plan | Visual identity | Premium feel | Productivity | Upgrade clarity | Notes |
|---|---|---|---|---|---|
| **Free** | 6 | 4 | 7 | — | Coherent field-tech home |
| **Starter** | 4 | 3 | 7 | **2** | Visually ≈ Free; paid value invisible |
| **Professional** | 7 | 6 | 5 | **7** | Clear home upgrade; app chrome unchanged |
| **Business** | 7 | 6 | 5 | **5** | Intended executive portal; still Pro twin + incomplete team |

**Aggregate (paid tiers):**

| Score | Value | Interpretation |
|---|---|---|
| **Premium experience** | **5 / 10** | Heroes help; Starter fails; Pro→Business subtle |
| **Visual identity** | **5.5 / 10** | Two hero skins, one global shell, no Starter identity |
| **Productivity** | **5.5 / 10** | Free/Starter best for jobs; Pro/Business best for campaigns; no unified premium ops home |

### Does Professional feel like an upgrade?

**Partially yes** — the home screen does. The wider app does not reinforce the purchase (same nav, same AI, same job UI, sidebar still pushes Upgrade / free meter).

### Does Business feel like an executive workspace?

**Not yet.** Copy and Marketing Centre IA aim there, but:

- Same data/widgets as Professional  
- Team/dispatch is placeholder  
- No executive density (P&L, staff, schedule, pipeline)  
- Light shared body under a dark hero reads as a marketing landing, not a company OS  
- Brand colours do not theme the workspace  

---

## 12. Recommended improvements (next phase — do not implement here)

Prioritise **perception and IA**, not entitlement redesign.

1. **Give Starter a distinct home identity** — even a light treatment (plan hero strip, hide free-meter sidebar, celebrate unlimited apply) so Free → Starter is visible.  
2. **Plan-aware shell** — header/sidebar/AI label reflect Starter / Professional / Business (not permanent “Technician Pro”).  
3. **Keep job productivity on paid homes** — compact “jobs needing attention” strip on Pro/Business so upgrade does not feel like losing the field dashboard.  
4. **Differentiate Business beyond twin of Pro** — unique widgets (company health, campaign calendar, approval queue, revenue), not only CTA renames; finish or hide Team.  
5. **Apply brand personalization** — optional accent from `brandPrimaryColor` on Business chrome/hero.  
6. **Tiered visual tokens** — subtle accent/border/badge treatments that travel into Jobs/Marketing, so premium features *look* premium.  
7. **Separate or extend dashboard API for Business** if Business metrics should diverge from `professionalDashboard`.  
8. **Avoid redesigning** catalogue, entitlement flags, or payment verification in the experience pass.

---

## 13. Files likely affected (future work only)

| File | Why |
|---|---|
| `apps/technician/pages/DashboardPage.tsx` | Starter vs Free split / Starter identity |
| `apps/technician/pages/ProfessionalDashboardPage.tsx` | Job strip, stronger Pro identity |
| `apps/technician/pages/BusinessDashboardPage.tsx` | Executive differentiation |
| `apps/technician/components/layout/AppShell.tsx` | Plan-aware nav, branding, hide free meter when paid |
| `apps/technician/components/DeveloperPreviewBanner.tsx` | Already plan-aware; keep aligned |
| `apps/technician/pages/MarketingCentrePage.tsx` | Business premium hub polish |
| `apps/technician/pages/CompanyProfilePage.tsx` | Wire brand colours into theme consumers |
| `apps/technician/context/AppContext.tsx` | Expose plan identity to shell |
| `packages/api/technicianMarketingApi.ts` | Optional Business dashboard payload |
| Shared header / AI launcher packages | Plan labels |
| Design token / CSS theme layers (if introduced) | Plan accents |

---

## 14. Risks of status quo

| Risk | Impact |
|---|---|
| Starter churn / refund complaints (“nothing changed”) | High — value is mostly invisible |
| Pro→Business upsell weak | Medium — twin dashboards |
| Marketing-heavy Pro/Business homes reduce job win rate UX | Medium |
| “Pro” branding on free users blurs paid meaning | Medium |
| Company brand colours unused in chrome | Low–Medium trust in Business promise |

---

## 15. Out of scope (this phase)

- No code changes  
- No subscription redesign  
- No entitlement changes  

---

*End of audit.*
