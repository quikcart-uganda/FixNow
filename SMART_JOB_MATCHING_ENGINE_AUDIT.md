# Smart Job Matching Engine Audit

**Date:** 2026-07-28  
**Product:** FixNow marketplace  
**Scope:** Job publish → technician matching → notifications → applications → customer selection → award  
**Stance:** Full-system audit + recommended matching architecture. **Matching engine not shipped in this pass** — this document is the production design gate before implementation.

---

## Executive verdict

FixNow **does not have an intelligent matching engine today**.

When a customer posts a job, the system:

1. **Socket.IO-broadcasts** `job:published` to **every connected technician** (`ROOMS.role('technician')`)
2. Sends **FCM/push only to admins** (`job.published`)
3. Relies on technicians to **pull** `GET /jobs/nearby`, which filters by **primary category + profile district + optional geo `$near`**

That is the opposite of the target workflow: *match → notify only eligible → apply → select → award*.

| Ideal | Current |
|---|---|
| Notify only eligible trades | Broadcast sockets to all technicians |
| Push matched technicians | Push admins only on publish |
| Coverage / radius / availability / verified gates | Unused for fan-out; nearby ignores CoverageArea & availability |
| Match score ranks who gets notified | Apply-time heuristic only; feed shows fake defaults |
| Notification waves | None |
| Losers notified on hire | Silent auto-reject |
| Admin match telemetry | Push stats + job counts only |

**Production readiness for smart matching: Not ready.**  
Hire/assignment pipeline itself works. Matching + notification targeting does not.

---

## Current workflow

```
Customer PostJob (publish:true)
        │
        ▼
Job.create(status=posted) + publicJobReference
        │
        ├─► Socket: job:created + job:published
        │         → customer + ALL technicians + admin
        │
        └─► Push/in-app: job.published
                  → admins ONLY
                  → technicians: NONE

Technician discovers jobs (pull)
        │
        ▼
GET /jobs/nearby
  filter: posted
       + location.district (query OR profile)
       + categoryId (query OR primaryCategoryId)
       + optional geo $near (default 50 km)
        │
        ▼
Technician applies (POST /jobs/:id/applications)
  matchScore = trust*0.5 + category bonus + min(jobsCompleted,20)
  notify customer (application.received)
        │
        ▼
Customer Accept
  winner → application.accepted + assignment
  losers → status=rejected via updateMany (NO notify)
  Socket: technician:assigned → job parties + ALL technicians + admin
```

### Key files

| Layer | Path |
|---|---|
| Job model | `backend/src/models/marketplace/Job.ts` |
| Job / application service | `backend/src/services/marketplace/job.service.ts` |
| Free-job gates | `backend/src/services/marketplace/freeJob.service.ts` |
| Coverage / profile | `backend/src/models/technician/Technician.ts`, `technician.service.ts` |
| Socket broadcast | `backend/src/sockets/realtime.ts` (`emitJobCreated`, `emitJobPublished`, `emitTechnicianAssigned`) |
| Push / FCM | `backend/src/services/push/push.service.ts`, `utils/notify.ts` |
| Technician feed | `apps/technician/pages/JobsFeedPage.tsx` |
| Customer applications | `apps/customer/pages/JobApplicationsPage.tsx` |
| Post job | `apps/customer/pages/PostJobPage.tsx` |
| Nearby mapper | `packages/api/mappers.ts` → `mapNearbyJob` |

---

## Step 1 — Notification inventory (every send site)

### A. Job publish

| Channel | Recipient | Evidence |
|---|---|---|
| Socket `job:created` / `job:published` | **All technicians** + customer + admin | `emitJobCreated` pushes `ROOMS.role('technician')` when status is `posted` |
| Push `job.published` | **Admins only** | `job.service.ts` → `notifyAdmins` |
| Push to matched technicians | **Missing** | — |

### B. Application lifecycle

| Event | In-app + FCM | Socket |
|---|---|---|
| Apply | Customer `application.received` | `application:submitted` (customer, tech, job, admin) |
| Explicit reject | That technician `application.rejected` | `application:rejected` |
| Accept (winner) | Winner `application.accepted` | `technician:assigned`, `job:assigned`, … **also room `role:technician`** |
| Accept (losers) | **None** | **None** (bulk `updateMany` only) |
| Withdraw | **None** to customer | `application:withdrawn` |

### C. Job lifecycle (assigned job)

| Event | Who |
|---|---|
| Status transitions (en_route, in_progress, completed, cancelled) | Assigned parties ± customer |
| Tracking events | Customer |
| Free-job lock | Locked technician + admins |

### D. Email / SMS

Preference flags exist (`NotificationPreference`). **Job matching path does not send email/SMS.**

---

## Step 2 — Eligibility today vs required

### Required (product)

| Condition | Used for notify fan-out? | Used for nearby feed? | Notes |
|---|---|---|---|
| ≥1 matching category | No | Primary category only | `subcategoryIds` / multi-service ignored |
| Active account | No | No | Apply path checks suspension via free-job helpers |
| Verified | No | Selected but not filtered | `verificationStatus` loaded in nearby, unused |
| Available | No | No | `isAvailableNow` / working hours unused |
| Notifications enabled | No | N/A | Prefs apply when `notifyUser` runs; publish never calls it for techs |
| Inside service radius | No | Geo `$near` on **profile** point, not CoverageArea | CoverageArea unused |
| Not suspended | No | No | Apply gate only |
| Not blocked | No | No | No customer↔technician block model in this path |
| Supports customer district | No | District equality on job.location | Coverage districts unused |

### Data that already exists but is unused for matching

- `CoverageArea` (district, `radiusKm`, center Point)
- `TechnicianAvailability` / `WorkingHours` / `isAvailableNow`
- `verificationStatus`, `identityVerified`, `skillVerified`
- `Job.recommendedTechnicianIds`, `Job.aiMatchScore` (schema stubs, never populated)
- Notification preferences (`marketplace` category)

---

## Step 3 — Current “ranking”

### Apply-time `matchScore` (only real score)

```text
matchScore = min(100, round(
  trustScore * 0.5
  + (primaryCategory == job.category ? 30 : 10)
  + min(jobsCompleted, 20)
))
```

Used to sort customer application lists. **Not** used to decide who is notified.

### Feed scores (misleading)

`mapNearbyJob` defaults `matchScore` / `successScore` to **80** and `matchReasons` to `['Nearby job']` when the API omits them. Backend nearby does not compute distanceKm or scores. UI copy mentioning “AI Match” is not backed by a matching engine.

---

## Problems found

### P0 — Spam / relevance

1. **Socket broadcast to all technicians** on every publish and on assignment.  
2. **No FCM to eligible technicians** on publish — offline pros miss jobs unless they open the app later.  
3. **CoverageArea ignored** — operating radius / multi-district support does not drive eligibility.

### P0 — Selection fairness

4. **Silent auto-reject** on hire — losers get no “job assigned to another technician” message; may keep chasing a dead job in UI until refresh.

### P1 — Matching quality

5. Nearby locked to **primaryCategoryId** — multi-category technicians miss jobs in their other trades.  
6. No availability / verification filter on discovery.  
7. No workload / response-rate / emergency ranking.  
8. No notification waves / escalation.

### P1 — Product data gaps

9. Job model lacks first-class **emergency / urgency** and **estimated duration** (nearby selects `urgent`, but field is not on schema).  
10. Customer `PostJobPage` often under-specifies budget/location (hardcoded parish/district defaults in places).

### P2 — UX / admin

11. Available Jobs filters (district chips, “Filters”) are decorative; only distance pill hits the API.  
12. Application statuses `shortlisted` / `expired` exist in enum with **no writers**.  
13. Admin has push delivery stats, not match-wave / eligibility / selection-time analytics.  
14. Fake feed match scores erode trust.

---

## Target workflow (to implement)

```
Customer posts job (posted)
        │
        ▼
Matching Engine (async job)
  1. Build eligible candidate set (hard filters)
  2. Score & rank
  3. Persist JobMatch records
  4. Dispatch Wave 1 notifications (top N)
        │
        ▼
Eligible technicians
  - Push + in-app (rich payload)
  - Job appears on Available Jobs (matched only)
        │
        ▼
Applications → Customer reviews statuses
        │
        ▼
Insufficient apps after T1? → Wave 2 (expand radius)
Insufficient after T2? → Wave 3 (related categories)
Insufficient after T3? → Wave 4 (wider region, still category-eligible)
        │
        ▼
Customer selects technician
  - Winner: job awarded notification
  - Losers + unmatched notified applicants: "assigned to another"
  - Cancel pending waves; no further fan-out
```

**Never notify unrelated trades** — even Wave 4 stays inside category (or explicitly related category graph).

---

## Matching algorithm

### A. Hard eligibility (ALL required)

A technician is eligible iff:

| # | Rule | Source |
|---|---|---|
| 1 | Account active / not suspended | `User.accountStatus`, profile `accountStatus` |
| 2 | Not free-job locked (if product requires apply-ready) | `accountLocked` / remaining free jobs — *configurable: notify locked techs who can only browse?* Recommend: **notify only if they can apply** |
| 3 | Verified at configured level | Default: `verificationStatus ∈ {verified, partially_verified}` OR `identityVerified` — admin-configurable |
| 4 | Available | `isAvailableNow === true` OR within working hours for job preferred window — admin-configurable strictness |
| 5 | Notifications enabled | `NotificationPreference` push/inApp + `marketplace` category on |
| 6 | Category match | Job `categoryId` ∈ `{ primaryCategoryId } ∪ subcategoryIds ∪ active TechnicianService.categoryIds` |
| 7 | District / coverage | Job district ∈ coverage districts **OR** haversine(job.geo, coverage.center) ≤ coverage.radiusKm **OR** (fallback) haversine to profile.geo ≤ default radius |
| 8 | Not blocked by customer | Future `Block` collection; skip if exists |
| 9 | Not already applied / withdrawn for this job | Application uniqueness |

### B. Soft ranking → overall `matchScore` (0–100)

| Factor | Weight | Formula sketch |
|---|---|---|
| Category relevance | 25 | Exact primary 25; service/subcategory 18; related category (wave 3+) 10 |
| Distance | 20 | `max(0, 20 * (1 - km / waveRadiusKm))` |
| Availability | 10 | Available now 10; within hours 6; else 0 (if soft) |
| Trust score | 15 | `trustScore / 100 * 15` |
| Response rate | 8 | From profile / trust metrics |
| Completion rate | 8 | From profile |
| Customer rating | 7 | `ratingAverage / 5 * 7` |
| Recent activity | 4 | Last login / last apply within 7d |
| Workload | 3 | Inverse of active assigned jobs (cap) |
| Emergency fit | 0–5 bonus | If job.urgent and tech emergency/available flag |

```text
matchScore = clamp(0, 100, Σ weighted factors + bonuses)
```

Store factor breakdown on `JobMatch.scoreBreakdown` for admin/debug.

### C. Wave policy (defaults — admin-configurable)

| Wave | Trigger | Candidate set | Notify count |
|---|---|---|---|
| 1 | Immediate on publish | Eligible + score ≥ `wave1MinScore` (e.g. 55), radius R1 (e.g. 10 km or coverage) | Top `wave1Size` (e.g. 15) |
| 2 | After `wave2AfterMinutes` if apps < `minApplications` | Expand radius to R2 (e.g. 25 km) | Next top M not yet notified |
| 3 | After `wave3AfterMinutes` if still short | Related categories (admin category graph / same parent) | Next batch |
| 4 | After `wave4AfterMinutes` | All eligible in operational region (district cluster / R4 e.g. 50–80 km), **still category-eligible** | Remaining eligible, capped |

Stop waves when: job leaves `posted`, applications ≥ target, or admin cancels matching.

---

## Notification flow

### Publish → match → notify

1. Job reaches `posted` → enqueue `job.match.dispatch` (Bull/agenda/in-process queue).  
2. Matching worker writes `JobMatch` rows (`pending` → `notified`).  
3. For each wave recipient: `createDbNotification` + FCM with deep link to job details / Available Jobs.  
4. Socket: emit to **user room** `user:{technicianId}` only — **not** `role:technician`.

### Payload (required content)

| Field | Example |
|---|---|
| Title | New job near you |
| Job title | Kitchen sink leak |
| Category | Plumbing |
| Approximate location | Nakawa, Kampala (~3 km) |
| Budget | UGX 80,000 – 120,000 |
| Estimated duration | ~2 hours (when collected) |
| Time posted | 4 min ago |
| CTA | Open Applications / View job |

Respect quiet hours + channel prefs. Deduplicate: one notify per tech per job per wave.

### After selection

| Audience | Message |
|---|---|
| Chosen technician | Job awarded / You were selected for “{title}” |
| Other applicants | This job has been assigned to another technician. |
| Notified but non-applicants (optional) | Job no longer available |
| System | Cancel pending waves; mark matches `closed` |

**Fix required immediately in any implementation sprint:** replace silent `updateMany` reject with per-loser notify (or batched notify) + stop broadcasting assignment to all technicians.

---

## Available Jobs screen

### Target behavior

- Source of truth: jobs where technician has `JobMatch` **or** passes live eligibility (for late joiners).  
- Default: matched categories only (multi-category union).  
- Filters: Distance · Newest · Budget · Emergency · Highest paying · Nearest.  
- Remove fake AI scores; show real `matchScore` + 1–2 reasons (“Same trade · 2.4 km · High trust”).

### Today → gap

Distance pill only; district chips / Filters unwired; mapper fabricates scores.

---

## Customer application statuses

| Status | Today | Target |
|---|---|---|
| Pending | ✓ | ✓ |
| Shortlisted | Enum only | Customer shortlist action + notify tech optional |
| Selected / Accepted | ✓ (`accepted`) | Keep; surface as “Selected” |
| Declined / Rejected | ✓ | Keep naming consistent in UI |
| Withdrawn | ✓ backend; weak UI | Show clearly |
| Expired | Enum only | Auto-expire when job assigned/cancelled or SLA passes |

Customer UI should group or filter by these states, not only raw badges.

---

## Admin dashboard (matching ops)

Expose per job and aggregate:

| Metric | Description |
|---|---|
| Technicians matched | Count of `JobMatch` eligible |
| Who was notified | List + wave number + score |
| Delivery success | Push sent / failed / no device |
| Opened notifications | In-app open / deep-link open (needs event) |
| Applications received | Count + conversion from notified |
| Selection time | `assignedAt - postedAt` |
| Score distribution | Histogram of match scores notified |

Surface on Admin job detail + marketplace metrics. Reuse push stats plumbing; add match-specific collections.

---

## Database changes (recommended)

### New collections

**`JobMatch`**

```text
jobId, technicianId, technicianProfileId
wave: 1|2|3|4
status: eligible | notified | applied | skipped | closed
matchScore: 0–100
scoreBreakdown: { category, distance, availability, trust, ... }
distanceKm?
notifiedAt?, openedAt?, appliedAt?
delivery: { push: sent|failed|skipped, inApp: bool, error? }
createdAt, updatedAt
unique(jobId, technicianId)
indexes: { jobId, wave, status }, { technicianId, status }, { jobId, matchScore }
```

**`JobMatchingRun`** (optional audit)

```text
jobId, startedAt, finishedAt
eligibleCount, notifiedCount, applicationCount
wavesExecuted: number[]
configSnapshot
```

**`PlatformSetting` key:** `marketplace.job_matching`

```text
wave1Size, wave1MinScore, wave1RadiusKm
wave2AfterMinutes, wave2RadiusKm, wave2Size
wave3AfterMinutes, relatedCategoryMode
wave4AfterMinutes, wave4RadiusKm
minApplicationsToStop
requireVerified, requireAvailableNow
notifyOnlyIfCanApply
stopOnAssign: true
```

### Job model extensions (additive)

| Field | Purpose |
|---|---|
| `urgent` / `isEmergency` | Emergency ranking + filter |
| `estimatedDurationMinutes` | Notification content |
| `matchingStatus`: `pending\|running\|paused\|complete` | Ops |
| `matchingStats` denormalized summary | Admin list |

Keep `recommendedTechnicianIds` / `aiMatchScore` but **populate from JobMatch** (top scores), or deprecate in favor of JobMatch.

### Category relatedness

Either:

- `Category.relatedCategoryIds[]`, or  
- Parent-group membership for Wave 3  

Without this, Wave 3 cannot expand safely.

---

## Notification architecture changes

| Today | Target |
|---|---|
| `emitJobCreated` → all technicians | Emit to customer + admin; technicians via per-user rooms from JobMatch |
| `notifyAdmins` only on publish | Keep admin alert **plus** matched technician notifies |
| Assignment socket to all technicians | Job parties + winner; losers get targeted reject notify |

Suggested service module:

```text
backend/src/services/marketplace/jobMatching.service.ts
  findEligibleTechnicians(job, waveConfig)
  scoreTechnician(job, tech, ctx)
  dispatchWave(jobId, wave)
  onApplicationCreated(jobId)      // maybe early-stop
  onJobAssigned(jobId)             // cancel waves + notify losers
  getAvailableJobsForTechnician()  // feed
```

Queue: reuse existing workers if present; otherwise start with `setImmediate` + durable `JobMatchingRun` and move to Redis/Bull when volume grows.

---

## Performance & scalability

### Concerns at broadcast scale

- Socket fan-out to all technicians grows **O(online technicians)** per job — noisy and CPU/bandwidth wasteful.  
- Nearby queries with district+category are OK at small scale; geo `$near` needs 2dsphere indexes (already on `Job.geo`).

### Matching engine scale plan

| Volume | Approach |
|---|---|
| Low (MVP) | Sync eligible query + notify top N in request after publish (careful with latency) — prefer async |
| Medium | Async worker; prefilter by `categoryId` + district indexes on TechnicianProfile / CoverageArea |
| High | Maintain inverted indexes: `categoryId → technicianIds`, geo shards; batch FCM (multicast ≤500) |

### Query sketch for candidates

```text
1. Technicians with category match (primary OR subcategory OR services)
2. Intersect coverage district OR geo within R
3. Filter accountLocked=false, verification, availability, prefs
4. Sort by score, take wave size
```

Indexes to add:

- `CoverageArea`: `{ district: 1, technicianUserId: 1 }`, geo on `center`  
- `TechnicianProfile`: `{ primaryCategoryId: 1, accountLocked: 1, isAvailableNow: 1, verificationStatus: 1 }`  
- `TechnicianService`: `{ categoryId: 1, technicianUserId: 1, isActive: 1 }`

Avoid loading all technicians into memory.

### Mobile / desktop / Android

Single SPA + Capacitor: one Available Jobs UI; FCM already wired via push service. Deep links must open job detail on Android. Socket targeting by user room must work when app is foregrounded; FCM covers background.

---

## Ranking formula (canonical)

```text
score =
  0.25 * categoryRelevance01 * 100
+ 0.20 * distanceScore01 * 100
+ 0.10 * availability01 * 100
+ 0.15 * (trustScore/100) * 100
+ 0.08 * responseRate01 * 100
+ 0.08 * completionRate01 * 100
+ 0.07 * (ratingAverage/5) * 100
+ 0.04 * recentActivity01 * 100
+ 0.03 * workload01 * 100
+ emergencyBonus (0–5)

matchScore = round(clamp(score, 0, 100))
```

Tune weights in `marketplace.job_matching` without code deploy where possible.

---

## Implementation phases (recommended)

| Phase | Scope | Risk |
|---|---|---|
| **0** | Stop all-technician socket broadcast on publish/assign; notify auto-reject losers | Low — behavior fix |
| **1** | `JobMatch` + eligibility + score; populate on publish (async); Available Jobs from matches | Medium |
| **2** | FCM/in-app rich payload to matched techs; deep link CTA | Medium |
| **3** | Waves 2–4 + PlatformSetting config | Medium |
| **4** | Admin matching dashboard + open/delivery metrics | Low–medium |
| **5** | Job urgent/duration fields + PostJob UX; shortlist/expire writers | Product-dependent |

Feature flag: `JOB_MATCHING_V1` — while off, keep nearby pull but still stop broadcast spam (Phase 0).

---

## Validation checklist (for implementation)

| Check | Pass criteria |
|---|---|
| Only relevant technicians notified | No JobMatch / notify without category eligibility |
| No spam | No `ROOMS.role('technician')` on publish |
| Multi-category | Secondary categories receive matches |
| Waves | Wave 2+ only when apps below threshold; unrelated trades excluded |
| Losers notified | Every auto-reject gets message |
| Feed filters | Distance / newest / budget / emergency / pay / nearest wired |
| Performance | Publish API returns without waiting for full fan-out; worker &lt; few seconds for hundreds of candidates |
| Platforms | Web desktop, mobile web, Android FCM + deep link |

---

## Production readiness verdict

| Area | Ready? | Blocker |
|---|---|---|
| Job create / assign / escrow path | **Yes** | — |
| Application CRUD | **Mostly** | Thin apply payload (separate audit); silent losers |
| Intelligent eligibility | **No** | No matching service; CoverageArea unused |
| Targeted notifications | **No** | Broadcast sockets; no tech push on publish |
| Ranking for notify | **No** | Apply-time heuristic only; fake feed scores |
| Waves | **No** | Missing |
| Available Jobs relevance | **Partial** | Primary category + district pull only |
| Customer status UX | **Partial** | shortlisted/expired unused |
| Admin matching ops | **No** | No match telemetry |
| Scalability of notify | **Poor** | O(all technicians) socket fan-out |

**Overall:** The marketplace can post and hire jobs, but **notification and discovery are not production-grade for a multi-trade Uganda marketplace**. Shipping smart matching requires Phases 0–3 above before claiming “only eligible technicians are notified.”

---

## Final recommendation

1. **Approve this audit** as the matching contract.  
2. Implement **Phase 0 immediately** (stop broadcast spam + notify losers) — high trust, low risk.  
3. Implement **Phases 1–3** as the Smart Matching Engine (`jobMatching.service` + `JobMatch` + waves + FCM).  
4. Follow with admin telemetry and Available Jobs filter polish.

**Do not** add more Socket.IO role broadcasts or “notify everyone” shortcuts while scaling technician count.

---

## Appendix — Evidence snippets

**Broadcast on publish** (`realtime.ts`):

```text
if (status === 'posted') {
  rooms.push(ROOMS.role('technician'));
}
// job:published also includes ROOMS.role('technician')
```

**Nearby filters** (`job.service.ts` → `nearby`): district + primaryCategoryId + optional `$near` (default 50 km). CoverageArea / availability / verified not applied.

**Silent losers** (`job.service.ts` → `accept`):

```text
JobApplication.updateMany({ pending|shortlisted, ≠ winner }, { status: rejected })
// no createDbNotification loop
```

**Admin-only publish push** (`job.service.ts` → `create`/`publish`): `notifyAdmins({ type: 'job.published' })`.
