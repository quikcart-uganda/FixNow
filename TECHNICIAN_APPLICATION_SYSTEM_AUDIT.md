# Technician Application System Audit

**Date:** 2026-07-28  
**Product:** FixNow marketplace  
**Scope:** Technician permanent profile · Job application · Customer View Applications · Public profile · Admin · Notifications · Mobile/Desktop  
**Stance:** Audit + recommended architecture first. **No blind redesign implemented in this pass.**

---

## Executive verdict

Today’s application flow is **too thin for a production marketplace**, not too heavy.

| Layer | Reality |
|---|---|
| Technician apply UI | One-tap **Apply** with an **empty body** — no ETA, quote, or pitch |
| Application model | Supports `message`, `proposedAmount`, `estimatedHours`, `availableFrom` — mostly unused by UI/validator |
| Technician profile | Already holds most permanent identity, trust, and category data |
| Customer applications page | Sparse Accept/Reject cards — name + optional rating/trust/jobs; almost never shows quote/message |
| Public profile | Drops portfolio/reviews the API already returns |
| Admin | Raw application IDs only; cannot hire/reject |

**Principle to preserve:** permanent data lives on the technician profile; the application asks only job-specific fields. FixNow already follows that principle accidentally (apply asks nothing). The gap is the opposite of “long forms” — customers cannot decide well because applications carry almost no commercial or operational signal.

---

## Part 1 — Current implementation audit

### 1.1 Models (source of truth)

| Entity | Path | Role |
|---|---|---|
| `User` | `backend/src/models/auth/User.ts` | `fullName`, `email`, `phone`, role |
| `TechnicianProfile` | `backend/src/models/technician/Technician.ts` | Bio, photo, categories, skills, languages, experience, location, denormalized trust, verification flags, availability |
| `CoverageArea` / `WorkingHours` / `TechnicianAvailability` | same technician models file | District, radius, hours, availability |
| `Job` | `backend/src/models/marketplace/Job.ts` | Customer job, budget, location, status, `applicationCount` |
| `JobApplication` | same file (`IJobApplication`) | Per-job offer: message, proposedAmount, estimatedHours, availableFrom, status, matchScore, trustSnapshot |
| `Assignment` | same file | Created on accept; `agreedAmount` from proposedAmount |
| Portfolio / Trust / Verification | `models/portfolio`, `models/trust`, `models/verification` | Optional enrichment |

#### JobApplication fields today

```
jobId, technicianId, technicianProfileId?
message? (max 2000)
proposedAmount?, currency
estimatedHours?, availableFrom?
status: pending | shortlisted | accepted | rejected | withdrawn | expired
matchScore?, trustSnapshot?
respondedAt?, withdrawnAt?
```

Unique: `{ jobId, technicianId }`.

#### TechnicianProfile — already present vs ideal permanent profile

| Ideal permanent field | Current |
|---|---|
| Profile photo | `photoUrl` ✓ |
| Full name | `User.fullName` ✓ |
| Primary profession | Via `primaryCategoryId` / `headline` (no dedicated “profession” string) |
| Additional categories | `subcategoryIds` ✓ |
| Phone | `User.phone` ✓ |
| District | `location.district` + CoverageArea ✓ |
| Operating radius | `CoverageArea.radiusKm` ✓ |
| Short bio ≤250 | `bio` exists but **max 2000** |
| Years of experience | `experienceYears` ✓ |
| Languages | `languages` ✓ |
| Verification status | `verificationStatus`, `identityVerified`, `skillVerified` ✓ |
| Availability | `isAvailableNow` + availability collections ✓ |
| Trust metrics | Denormalized scores + `TrustScore` ✓ |
| Completed jobs / rating | `jobsCompleted`, `ratingAverage`, `reviewCount` ✓ |
| Response speed | `responseTimeMinutesAvg`, `responseScore` ✓ |
| Member since | Timestamps ✓ |
| Business name / logo / social / insurance / awards | **Missing** (portfolio exists separately) |
| Emergency / weekend / night flags | Partial via working hours; no explicit booleans |

### 1.2 APIs

| Action | Route | Body today | Notes |
|---|---|---|---|
| Apply | `POST /jobs/:id/applications` | Zod: `{ message?, proposedAmount? }` | UI sends `{}` |
| List for job | `GET /jobs/:id/applications` | — | Customer/admin; returns `{ application, technician }` + unused `comparison` |
| Accept / hire | `POST /applications/:id/accept` | none | Auto-rejects others |
| Reject | `POST /applications/:id/reject` | none | |
| Withdraw | `POST /applications/:id/withdraw` | none | |
| Mine | `GET /applications/me` | — | Marks applied in feed only |
| Admin list | `GET /admin/applications` | `status?` | Raw docs — no names/photos |

**Mismatch:** service/model accept `estimatedHours` / `availableFrom`, but Zod strips them. `shortlisted` / `expired` statuses exist with no writers.

Client: `packages/api/applicationsApi.ts`.

### 1.3 Notification flow

| Event | Customer | Technician | Gap |
|---|---|---|---|
| Apply | In-app + push `application.received` | Socket `application:submitted` | Admin socket only — no admin push |
| Accept (hired) | — | `application.accepted` + assignment events | OK |
| Accept (auto-reject others) | — | **Silent** | No notify / socket for losers |
| Explicit reject | — | `application.rejected` | OK |
| Withdraw | Socket only | — | No DB notification to customer |

### 1.4 Technician apply UI (mobile + desktop)

Same React SPA (`apps/technician`) for web and Capacitor.

| Surface | File | Behavior |
|---|---|---|
| Feed | `JobsFeedPage.tsx` / `JobCard.tsx` | Skip / Apply — empty body |
| Details | `JobDetailsPage.tsx` | Sticky Apply — empty body |
| My applications | — | **No management UI** (only `listMine` for “already applied”) |

**No duplicate profile fields on apply** — because apply asks nothing.

### 1.5 Customer View Applications

| Item | Detail |
|---|---|
| Page | `apps/customer/pages/JobApplicationsPage.tsx` |
| Route | `/customer/jobs/:id/applications` |
| Entry | My Jobs → Applications; Job Tracking → View Offers |

**Card shows today:** name (link), status, rating / trust / jobs completed (if present), quote/message (if present), Accept / Reject.

**Parsed but unused:** `matchScore`.  
**API returned but unused:** `comparison` array.

**Missing vs ideal card:** photo, verified badge, business name, profession, categories, distance, ETA, response rate, years experience, portfolio preview, review snippet, completion estimate, apply timestamp, View Profile / Portfolio / Chat / Call / Hire / Compare buttons, highlight badges (Best Match, Nearest, Top Rated, Fastest Arrival, Highest Trust).

**Layout:** single stacked list — no meaningful mobile/desktop redesign.

### 1.6 Customer public profile

| Item | Detail |
|---|---|
| Page | `apps/customer/pages/TechnicianProfilePage.tsx` |
| Route | `/customer/technician/:id` |

Shows photo, name, decorative verified icon, headline, rating, jobs, trust snippet, bio.  
**API already returns** portfolio / services / verification / trust detail — **UI ignores most of it**.  
CTAs: Book Now / Messages (not job-scoped hire/chat).

### 1.7 Admin

| Surface | Capability |
|---|---|
| `/admin/jobs?focus=applications` | Application ID, tech ID, job ID, status, message; links to job/tech |
| Dashboard pending apps | Same ID-centric table |
| Hire / reject / flag / suspend application | **Not available** (customer decides hire) |

---

## Part 1 — Problems found

### P0 — Customer decision quality

1. One-tap apply with empty payload → Accept/Reject without quote, ETA, or pitch.  
2. Applications card omits photo, profession, distance, verification, portfolio, timestamps.  
3. Backend selects `photoUrl` / `headline` but **does not map them** into list DTO; `experienceLevel` referenced without select.

### P1 — Architecture inconsistency

4. Validator ↔ model mismatch (`estimatedHours`, `availableFrom` stripped).  
5. Message max 2000 vs product ideal ≤200.  
6. No `acceptsBudget` mode — only free-form `proposedAmount`.  
7. No materials / site-inspection flags.  
8. `shortlisted` / `expired` dead states.  
9. Auto-reject on hire is silent for losing technicians.

### P2 — Profile & discovery gaps

10. Bio too long for “short professional bio”; no business name / social / emergency flags.  
11. Public profile wastes existing portfolio/reviews payload.  
12. Applications cards weaker than Home technician discovery cards.

### P3 — Admin / ops

13. Admin queue is ID-only; no human-readable enrichment.  
14. No abuse flag / application suspend / audit-friendly history view beyond raw docs.

### What is *not* a problem

- Asking technicians to re-enter name, phone, bio, categories on each apply — **already avoided**.  
- Separate web vs native apply stacks — **single SPA**.  
- Core hire pipeline (accept → assignment → conversation) — **exists and works**.

---

## Part 2–5 — Recommended target workflow (do not implement blindly)

### Separation of concerns

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Permanent Technician Profile│     │  Job Application (per job)   │
│  photo, name, categories,    │────▶│  ETA, price OR accept budget,│
│  bio≤250, languages, trust,  │ join│  short message ≤200,         │
│  verification, coverage…     │     │  optional: duration /        │
└─────────────────────────────┘     │  materials / inspection      │
                                    └──────────────────────────────┘
```

### Technician apply sheet (fast)

Required:

1. **Estimated arrival** — presets: 15 min / 30 min / 1 hour / Tomorrow morning (store as `etaPreset` + optional `availableFrom`)  
2. **Commercial term** — either **Accept customer budget** *or* **Proposed price (UGX)**  
3. **Short message** — max **200** characters  

Optional:

4. Estimated completion time  
5. Need materials from customer? Yes/No  
6. Need site inspection first? Yes/No  

**Do not collect:** photo, name, phone, bio, categories, languages, certificates, portfolio — read from profile.

### Customer applications card (compose profile + application)

Render joined DTO:

- From profile: photo, verified badge, name, business name (if added), profession, categories, distance, rating, trust, completed jobs, response rate, years experience, portfolio thumbs, latest review snippet  
- From application: ETA, message, proposed price / “Accepts budget”, completion estimate, materials/inspection, applied timestamp  
- Highlights from server `comparison` / `matchScore`: Best Match, Nearest, Top Rated, Fastest Arrival, Highest Trust  
- Actions: View Profile · View Portfolio · Chat (job thread) · Call (privacy policy) · Hire · Compare  

### Profile page

Use existing `getPublicProfile` payload: biography, skills, categories, portfolio, certificates (verification docs summary), reviews, completed jobs, trust metrics, languages, working hours, emergency/availability, operating areas. Gate verified badge on real verification.

### Admin

Enrich `GET /admin/applications` with job title + technician name/photo + key application fields. Keep hire as customer action; add: view profile, view history, flag abuse, suspend technician applications (account-level), audit trail links.

---

## Recommended database changes

### A. Extend `JobApplication` (additive, preferred)

| Field | Type | Notes |
|---|---|---|
| `etaPreset` | enum string | `15m` \| `30m` \| `1h` \| `tomorrow_morning` \| `custom` |
| `acceptsBudget` | boolean | default false |
| `materialsNeeded` | boolean \| null | optional |
| `siteInspectionRequired` | boolean \| null | optional |
| `message` | string | **lower maxlength to 200** (migrate truncate) |
| Keep | `proposedAmount`, `estimatedHours`, `availableFrom` | Wire through validator + UI |

**Validation rule:** `(acceptsBudget === true) XOR (proposedAmount != null)`.

### B. Extend technician profile (optional, phased)

| Field | Priority | Notes |
|---|---|---|
| `shortBio` or cap display of `bio` to 250 | P1 | Prefer display cap first to avoid migration pain |
| `businessName`, `businessLogoUrl` | P2 | |
| `socialLinks` map / array | P2 | website, facebook, instagram, tiktok, linkedin, whatsappBusiness, youtube |
| `emergencyAvailable`, `weekendAvailable`, `nightAvailable` | P2 | booleans |
| `specialEquipment[]`, `awards[]`, insurance/police flags | P3 | Prefer verification/portfolio docs where possible |

**Reuse first:** CoverageArea, WorkingHours, Portfolio, IdentityVerification, TrustScore — do not reinvent.

### C. Dead status cleanup

Either implement writers for `shortlisted` / `expired` or document them as reserved and hide from admin filters until ready.

---

## Recommended API changes

1. Extend `applyToJobSchema` + `applicationsApi.apply` with ETA, acceptsBudget, message≤200, optional completion/materials/inspection.  
2. Enrich `listForJob` technician DTO: `photoUrl`, `headline`, `verificationStatus`, `experienceYears`, `primaryCategoryName`, `distanceKm` (if geo), response metrics.  
3. Surface application ETA / flags on list items.  
4. Expose and use `comparison` for highlight badges.  
5. On accept: notify auto-rejected technicians (same copy as explicit reject) + emit `application:rejected`.  
6. Enrich admin `listApplications` joins.  
7. Job-scoped chat deep-link after hire (assignment already opens conversation — wire customer Chat CTA pre-hire carefully / post-hire).

---

## UI improvements (planned)

| Surface | Change |
|---|---|
| Technician Apply | Compact bottom sheet / dialog — 3 required fields, profile summary read-only |
| Customer applications | Rich cards + Compare mode; Hire language; responsive stack |
| Public profile | Render portfolio, reviews, trust breakdown already returned by API |
| Admin applications | Human-readable queue + CopyableId pattern + detail drawer enrichment |

### Fields added (application)

`etaPreset`, `acceptsBudget`, `materialsNeeded`, `siteInspectionRequired` (+ wire `estimatedHours` / `availableFrom`).

### Fields removed / not asked on apply

Anything permanent: name, photo, phone, bio, categories, languages, certificates, portfolio, socials.

### Fields tightened

`message` 2000 → **200**.

---

## Migration notes

1. **Additive schema first** — new application fields optional; old apps remain valid.  
2. **Message truncate** — one-off script: `message = message.slice(0, 200)` for documents longer than 200 before lowering maxlength.  
3. **Backfill highlights** — compute comparison server-side on list; no DB migration needed for badges.  
4. **Profile soft fields** — add business/social as optional; no required backfill.  
5. **Client rollout order**  
   1. API enrich list DTO (safe, no apply break)  
   2. Customer card UI  
   3. Apply sheet (required fields)  
   4. Profile page consume existing portfolio/reviews  
   5. Admin enrichment + silent-reject notifications  
6. **Feature flag** — `APPLICATIONS_V2` so empty apply can remain during staged mobile release.

---

## Validation checklist (for implementation phase)

| Check | Target |
|---|---|
| No duplicated permanent fields on apply | Pass by design |
| Apply ≤ 30 seconds for returning tech | Apply sheet only |
| Customer sees ETA + price/budget + message | Required |
| Profile photo + verified on card | Required |
| Portfolio / reviews on profile page | Required |
| Auto-reject notifies losers | Required |
| Mobile / tablet / desktop responsive | Required |
| Accessible Accept/Hire / Copy IDs | Required |
| Admin human-readable queue | Required |

---

## Production readiness assessment

| Area | Ready now? | Blocker |
|---|---|---|
| Hire / assignment / escrow path | **Yes** | — |
| Permanent profile core | **Mostly** | Soft fields optional |
| Apply commercial signal | **No** | Empty UI + incomplete validator |
| Customer decision UI | **No** | Sparse cards; unused API data |
| Public profile completeness | **Partial** | UI ignores portfolio/reviews |
| Notifications fairness | **Partial** | Silent auto-reject |
| Admin ops | **Weak** | ID-only monitoring |

**Overall:** Architecture is reusable and correctly separates profile vs application at the model level. The system is **not production-grade for marketplace hiring quality** until apply collects job-specific terms and the customer list joins profile trust/portfolio signals. Estimated implementation should follow the phased API→UI order above — not a greenfield rewrite.

---

## Key file index

```
backend/src/models/marketplace/Job.ts          # Job, JobApplication, Assignment
backend/src/models/technician/Technician.ts    # TechnicianProfile + coverage/hours
backend/src/models/auth/User.ts
backend/src/services/marketplace/job.service.ts
backend/src/validators/index.ts                # applyToJobSchema
packages/api/applicationsApi.ts
apps/technician/pages/JobsFeedPage.tsx
apps/technician/pages/JobDetailsPage.tsx
apps/customer/pages/JobApplicationsPage.tsx
apps/customer/pages/TechnicianProfilePage.tsx
apps/admin/pages/JobsPage.tsx                  # focus=applications
apps/admin/pages/DashboardPage.tsx
```

---

## Recommended next implementation sprint (when approved)

1. Enrich `listForJob` DTO + redesign customer application cards (biggest customer-facing win; reuses existing apply).  
2. Add apply bottom sheet with ETA + budget/price + message≤200.  
3. Wire public profile portfolio/reviews.  
4. Notify auto-rejected technicians; enrich admin applications list.  
5. Optional profile soft fields (business name, social, availability flags).

**Await product approval of this audit before coding Parts 2–6.**
