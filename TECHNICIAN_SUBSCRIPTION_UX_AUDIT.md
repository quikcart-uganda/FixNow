# Technician Subscription UX Audit

## Verdict

Technician subscription screens were rendering **raw entitlement engine fields** (`canApply`, `maxPhotos`, `searchPriorityWeight`, …). Presentation is now humanised. The subscription engine, entitlement logic, and plan calculations are **unchanged**.

---

## 1. Internal fields removed from UI

| Category | Examples no longer shown as raw keys / numbers |
| --- | --- |
| Capability flags | `canApply`, `canUploadPhotos`, `canUseHomepageSlides`, `canUseCertificates`, `canUseTeamPlaceholders`, `unlimitedApplications`, … |
| Limit keys | `maxPhotos`, `maxVideos`, `maxCertificates`, `maxActiveOffers`, `maxHomepageSlides`, … |
| Ranking inputs | `searchPriorityWeight`, `featuredWeighting`, `recommendationWeighting` (and numeric scores like 18 / 28) |
| Admin jargon | “Values come from live Admin subscription configuration”, “Yes (Admin rules)”, “If Admin enables” |
| Duplicate dumps | Separate “Capability flags” + “Feature limits” + “Limits” + “Capabilities (enforced)” blocks |

Unknown camelCase keys are **skipped** (not printed as-is).

---

## 2. User-facing replacements

| Internal | Shown as |
| --- | --- |
| `canUploadPhotos` / `uploadPhotos` | Upload photos |
| `canUploadVideos` | Upload videos |
| `unlimitedApplications` / `canApply` | Unlimited job applications / Job applications |
| `canUseCertificates` | Certificates & qualifications |
| `canCreateOffers` | Create promotional offers |
| `canUseHomepageSlides` | Homepage advertising |
| `canUseTeamPlaceholders` | Team / company profile |
| `maxPhotos` → `20` | Photos allowed · **20** |
| `maxPhotos` → `9999` | Photos allowed · **Unlimited** |
| `maxVideos` → `0` | Videos allowed · **Not included** |
| Weight `0` | Standard visibility |
| Weight `1–10` | Enhanced visibility |
| Weight `11–20` | High visibility |
| Weight `21+` | Premium placement |

Central map: `apps/technician/lib/subscriptionPresentation.ts`.

---

## 3. Sections simplified

### Subscription Centre (`SubscriptionCentrePage`)
1. **Your plan** — badge, status, CTA  
2. **What you get** — included benefits + plain limits  
3. **What you are missing** — locked benefits + upgrade CTA  
4. **Timeline** — dates when active; otherwise friendly empty copy  
5. **Payment history** — receipts or informative empty state  
6. **FAQ** — technician practical questions  

Removed: raw capability grid, raw limits list, unfinished dashed timeline for free users.

### Plan detail (`PlanDetailPage`)
- Single **What’s included** list (copy + mapped flags + visibility label)  
- Plain-language limits grid  
- FAQ filtered / fallback to technician FAQ  
- No “Capability flags” / “Feature limits” camelCase sections  

### Upgrade (`UpgradePage`)
- Plan cards use benefit previews (not raw feature strings that look like keys)  
- **Your plan vs next step** (current / next / what’s new + upgrade button)  
- **View full comparison** optional expandable table (humanised rows; weights hidden or translated)  
- Removed always-on huge matrix and admin config note  

### Billing + dashboards
- Payment empty state improved  
- Lifecycle labels humanised  
- Business / Professional dashboards show **visibility labels**, not `+28` scores  

---

## 4. Mobile improvements

- Comparison no longer forced full-width on first paint  
- Sticky feature column when full comparison is opened  
- Benefit lists and CTAs stack cleanly; primary upgrade action is obvious  
- FAQ uses `<details>` for compact scrolling  

---

## 5. Remaining technical information (if any)

| Item | Notes |
| --- | --- |
| Plan **codes** in payment history (`STARTER`, …) | Useful for receipts; not entitlement keys |
| MoMo checkout / transaction ID | Required for payment — operational, not engine internals |
| Free-job remaining count | Technician-facing quota, kept |
| Marketing inventory caps on Business/Pro dashboards | Shown as “Live slides: 2 / 8” style usage — not `maxAdvertisingSlides` labels |

Backend still returns full entitlement payloads; only the UI filters/maps them.

---

## 6. Final validation

| Check | Status |
| --- | --- |
| No backend property names as row labels | Pass (mapped or hidden) |
| No entitlement flags as camelCase | Pass |
| No algorithm weights as numbers | Pass (translated to visibility labels) |
| No “Admin configuration” developer note | Pass |
| Concise, upgrade-focused hierarchy | Pass |
| Engine / entitlement logic unmodified | Pass |

**Files touched:**  
`apps/technician/lib/subscriptionPresentation.ts` (new),  
`SubscriptionCentrePage.tsx`, `PlanDetailPage.tsx`, `UpgradePage.tsx`, `SubscriptionBillingPage.tsx`,  
`BusinessDashboardPage.tsx`, `ProfessionalDashboardPage.tsx`,  
`TECHNICIAN_SUBSCRIPTION_UX_AUDIT.md`.
