# Unified Hiring Workflow Audit

**Date:** 2026-07-28  
**Product:** FixNow marketplace  
**Scope:** Direct technician discovery · Direct booking · Marketplace posting · Invite-to-job · Shared Job/Assignment downstream  
**Stance:** Architecture audit + production design. **Implementation not shipped in this pass** — recommendations first (per Part 1).

**Related audits:**  
- `SMART_JOB_MATCHING_ENGINE_AUDIT.md` — marketplace matching / notification waves  
- `TECHNICIAN_APPLICATION_SYSTEM_AUDIT.md` — apply sheet / customer application cards  
- `TECHNICIAN_MVP_REGISTRATION.md` — signup / profile completion  

---

## Executive verdict

FixNow markets **two** hiring journeys, but the product currently has **one**:

| Journey | Product promise | Reality today |
|---|---|---|
| Direct discovery → Book | Hire a chosen technician | **Broken.** “Book Now” opens marketplace Post Job with **no technician bound** |
| Marketplace post → apply → select | Open job to eligible techs | **Works** (assignment pipeline solid; matching/notify weak — see matching audit) |
| Invite technician to a posted job | Priority invite | **Missing** |
| `DIRECT_BOOKING` vs `MARKETPLACE` origin | Unified Job model | **Missing** — every job is an undifferentiated marketplace post |

**Downstream after assignment is already unified** (chat, tracking, payments/escrow, reviews all key off `Job` + `Assignment`). That is the correct foundation — do **not** fork those systems.

**Production readiness for dual hiring:** **Not ready** until Book Now creates a real direct booking (or at minimum binds + notifies the chosen technician) and origins are distinguished end-to-end.

---

## 1. Current architecture

### 1.1 High-level (as implemented)

```
┌──────────────────────────── CUSTOMER ────────────────────────────┐
│  Search / Home / Offers → Technician Profile                      │
│       │                                                           │
│       ├─ "Book Now" ──► /customer/post-job   (technicianId LOST)  │
│       ├─ "Messages" ──► /customer/messages   (global inbox)       │
│       └─ Share URL (works)                                        │
│                                                                   │
│  Post Job ──► Job(status=posted) ──► Tracking ("Receiving Offers")│
│       │              │                                            │
│       │              ├─ Push: admins only                         │
│       │              └─ Socket: ALL technicians (broadcast)       │
│       ▼                                                           │
│  Applications list ── Accept ──► Assignment + Job(assigned)       │
└───────────────────────────────────────────────────────────────────┘

┌────────────────────────── TECHNICIAN ────────────────────────────┐
│  Jobs feed (nearby pull) ── Apply ──► Application(pending)        │
│  Active Jobs = assigned to me                                     │
│  No Invitations bucket · No applications-sent inbox page          │
└───────────────────────────────────────────────────────────────────┘

┌──────────────────────────── ADMIN ───────────────────────────────┐
│  Jobs by status · Applications queue · Push stats                 │
│  Cannot distinguish direct vs marketplace (field absent)          │
└───────────────────────────────────────────────────────────────────┘
```

### 1.2 Core entities (shared — keep)

| Entity | Role |
|---|---|
| `Job` | Work unit: location, category, budget, status, `assignedTechnicianId` |
| `JobApplication` | Marketplace (and future invite) interest |
| `Assignment` | 1:1 awarded work; triggers chat/track/pay |
| `Conversation` / messages | Job-scoped after assignment |
| `TrackingSession` | Live location after assignment |
| Escrow / payments | By `jobId` |
| Reviews | After `completed` |

### 1.3 Key file index

| Area | Path |
|---|---|
| Job / Application / Assignment | `backend/src/models/marketplace/Job.ts` |
| Job service | `backend/src/services/marketplace/job.service.ts` |
| Technician search / public profile | `backend/src/services/marketplace/technician.service.ts` |
| Saved technicians | `backend/src/models/customer/Customer.ts` (`SavedTechnician`) |
| Customer Post Job | `apps/customer/pages/PostJobPage.tsx` |
| Customer profile | `apps/customer/pages/TechnicianProfilePage.tsx` |
| Customer search | `apps/customer/pages/SearchPage.tsx` |
| Customer applications | `apps/customer/pages/JobApplicationsPage.tsx` |
| Customer my jobs | `apps/customer/pages/MyJobsPage.tsx` |
| Offer → book | `apps/customer/components/CustomerOfferCard.tsx`, `OfferDetailPage.tsx` |
| Technician feed | `apps/technician/pages/JobsFeedPage.tsx` |
| Sockets | `backend/src/sockets/realtime.ts` |

---

## 2. Problems found

### P0 — Broken direct hire promise

1. **Book Now does not book.** Profile CTA links to `/customer/post-job` with **no `technicianId`**.  
2. **Offer “Book Now” passes query params that Post Job ignores** (`?offerId=&technicianId=` — `PostJobPage` has **zero** `useSearchParams` usage). Discovered/offer technician is never notified or pre-assigned.  
3. **No direct-booking state machine** (accept / decline / suggest arrival). No competing-application exemption because there is no direct path.

### P0 — Notification targeting (both journeys)

4. Marketplace publish: **admin push only**; Socket.IO **broadcast to all technicians** (see `SMART_JOB_MATCHING_ENGINE_AUDIT.md`).  
5. Direct path would need **single-technician notify** — cannot exist until Book binds a technician.  
6. Hire losers: **silent auto-reject** (no “assigned to another technician”).

### P1 — Discovery / profile gaps

7. Search UI exposes only `q` + `categoryId`; API already supports `district`, `minTrust`, `available` — unused in UI.  
8. Public profile ignores portfolio / reviews / coverage / certs the API can return.  
9. Favourites API exists (`/customers/me/saved-technicians`) but profile has **no save control**; Settings “Saved technicians” → `/customer/search` (wrong).  
10. Chat CTA opens global inbox, not a tech-scoped thread (job chat only after assignment — correct for security, but CTA is misleading).  
11. Call / Request quotation / Invite to posted job — **missing**.  
12. Verified badge always shown (not gated on verification flags).

### P1 — Model / dashboard clarity

13. **No `Job.origin`** — admin/customer/tech cannot separate Direct vs Marketplace.  
14. Customer My Jobs: flat list, no Direct / Marketplace / Draft / Awaiting Applications buckets.  
15. Technician: no Invitations section; no “my applications” management page.  
16. `recommendedTechnicianIds`, `aiMatchScore`, `SHORTLISTED` — schema dead weight.

### P2 — UX / consistency

17. Post Job navigates to **Tracking** while still `posted` (“Receiving Offers”) — confuses track-with-pro vs wait-for-apps.  
18. Fake feed match scores (default 80) on technician nearby cards.  
19. Preference learning / recommendations — home has light personalisation; no durable preference model.  
20. Duplicate apply state (local `AppContext.appliedJobs` + `GET /applications/me`).

---

## 3. Direct booking workflow (target)

### Intent

Customer already chose the technician. **No marketplace competition.** Only that technician is notified.

```
Customer: Search → Profile → Book Technician
        │
        ▼
Create Job {
  origin: DIRECT_BOOKING
  status: pending_technician_acceptance   // or posted + exclusive flag
  targetTechnicianId: <chosen>
  assignedTechnicianId: unset until accept
}
        │
        ▼
Notify ONLY targetTechnician (high priority)
  Title: Direct booking request
  Body: {customer} wants to book you for {title} · {district} · {budget}
  CTA: Accept / Decline / Suggest time
        │
        ├─ Accept ──► Assignment + job → assigned
        │              (reuse accept side-effects: chat, sockets)
        │              Customer: “Technician accepted”
        │
        ├─ Decline ──► job → cancelled (or reopen as marketplace optional)
        │              Customer notified
        │
        └─ Suggest time ──► counter-proposal
                           Customer confirms → Accept path
                           Customer declines → cancel or renegotiate
```

### Rules

| Rule | Detail |
|---|---|
| No open applications | Other technicians must **not** see this job in Available Jobs / matching waves |
| No competing apps | Do not run matching engine for `DIRECT_BOOKING` |
| Notify scope | Exactly one technician (+ customer status updates + optional admin audit) |
| Downstream | Same Assignment → chat / tracking / escrow / reviews |
| Decline recovery | Prompt customer: Invite someone else · Post to marketplace · Cancel |

### UI mapping

| Action | Target |
|---|---|
| Profile **Book Technician** | `/customer/book/:technicianId` or `/customer/post-job?mode=direct&technicianId=` |
| Offer Book | Same + `offerId` → `metadata.offerId` |
| Technician dashboard **Invitations** | Direct booking requests + marketplace invites |

---

## 4. Marketplace workflow (target — preserve + harden)

Unchanged product shape; improvements from prior audits:

```
Post Job (origin: MARKETPLACE)
  → Matching engine (eligible only; waves)
  → Notify matched technicians
  → Applications
  → Customer selects
  → Assignment
  → Notify winner + losers
```

Do **not** duplicate chat/pay/track. See `SMART_JOB_MATCHING_ENGINE_AUDIT.md` for eligibility, scoring, waves, and Phase 0–3 plan.

---

## 5. Invite technician workflow (target)

Optional after marketplace post (or from job detail while `posted`):

```
Posted MARKETPLACE job
  → Invite Technician(s)
  → Search (reuse technician search API)
  → Select one or more
  → Create JobInvite / Application(source=invite, priority=true)
  → High-priority notify invited only
  → Application list shows “Invited” badge
```

### Rules

| Rule | Detail |
|---|---|
| Matching still runs | Invites are **additive** priority, not a replacement for waves (unless admin config) |
| Invited mark | Customer applications UI + admin |
| Cap | e.g. max 5 invites per job (configurable) |
| Already applied | Invite becomes no-op or bumps priority flag |

---

## 6. Shared backend services (reuse — do not fork)

| Service | Shared how |
|---|---|
| `Job` + status transitions | Single model; branch on `origin` only for eligibility / notify |
| `Assignment` | Created on: marketplace accept **or** direct accept |
| `ensureJobConversation` | After assignment (already) |
| Tracking | Requires `assignedTechnicianId` (already) |
| Payments / escrow | By `jobId` (already) |
| Reviews / ratings | Completed jobs (already) |
| `createDbNotification` / FCM | Same helper; different audience selection |
| Matching engine | **Marketplace (+ invite priority) only** — skip for `DIRECT_BOOKING` |
| Admin listJobs | Filter by `origin` |

**Anti-pattern to avoid:** `DirectBooking` collection that duplicates Job fields and a parallel payment pipeline.

---

## 7. Database changes (recommended)

### Additive Job fields

```text
origin: 'marketplace' | 'direct_booking' | 'offer'   // default marketplace
targetTechnicianIds: ObjectId[]                     // direct target + invites
exclusiveTechnicianId?: ObjectId                    // direct: only this tech may act
matchingEnabled: boolean                            // false for direct_booking
metadata.offerId?: ObjectId
directBooking?: {
  status: 'pending' | 'accepted' | 'declined' | 'counter_proposed' | 'expired'
  proposedArrivalAt?: Date
  technicianMessage?: string
  customerConfirmedAt?: Date
  respondedAt?: Date
}
```

Migration: existing jobs → `origin: 'marketplace'`, `matchingEnabled: true`.

### JobInvite (or Application.source)

Prefer **thin** approach first:

```text
JobApplication {
  ...existing
  source: 'open_apply' | 'invite' | 'direct_booking'
  invitedAt?: Date
  priority: boolean
}
```

For direct booking: create a single Application (`source: direct_booking`, `priority: true`) when job is created — technician Accept can either:

- **Option A (simplest reuse):** customer auto-pre-accepts on tech accept via internal `acceptDirect`, or  
- **Option B:** technician accept **is** the award (new `POST /jobs/:id/direct-respond`) which creates Assignment without a separate customer Accept click.

**Recommend Option B** for true direct book UX (customer already chose them).

### Preference learning (Part 10 — phase later)

```text
CustomerPreferenceProfile {
  userId
  topCategoryIds[]
  favouriteTechnicianIds[]   // mirror SavedTechnician
  preferredDistricts[]
  recentSearchQuery[]
  lastBookedAt
}
```

---

## 8. API changes (recommended)

| Endpoint | Change |
|---|---|
| `POST /jobs` | Accept `origin`, `technicianId` / `technicianIds`, `offerId`, `matchingEnabled` |
| `POST /jobs/:id/invite` | **New** — add invitees to posted marketplace job; notify; seed applications |
| `POST /jobs/:id/direct-respond` | **New** — technician `accept` \| `decline` \| `counter` with optional `proposedArrivalAt` |
| `POST /jobs/:id/direct-confirm` | **New** — customer confirms counter-proposal |
| `GET /jobs/nearby` / available | Exclude `origin=direct_booking` and jobs not matching viewer; exclude exclusive jobs for others |
| `GET /technicians/search` | Already rich — expose filters in UI; add `verified`, `maxDistanceKm`, multi `categoryIds` |
| `GET /customers/me/jobs` | Support `origin`, `bucket` filters |
| `GET /technicians/me/invitations` | **New** — direct + invite pending |
| Favourites | Wire existing saved-technicians routes to profile UI |

Validators: extend `createJobSchema`; add invite / direct-respond schemas.

---

## 9. Mobile compatibility

| Surface | Status | Action |
|---|---|---|
| Capacitor Android / responsive web | Single customer + technician SPAs | Implement once; both hiring modes in same routes |
| Deep links | FCM → job detail / invitation | Required for direct + invite priority notifies |
| Call | Prefer `tel:` to technician phone **only when policy allows** (assigned or direct-pending) | Privacy: hide until booking accepted if required |
| Share | Existing Web Share API | Keep |
| iPhone | Mobile web / future Capacitor iOS | Same React flows |

No separate native booking stack required.

---

## 10. Desktop compatibility

| Surface | Notes |
|---|---|
| Search + filters | Desktop: multi-filter sidebar; mobile: sheet |
| Profile | Portfolio / reviews grids |
| Post / Book | Same forms; direct mode banner “Booking {Name}” |
| Applications / Invitations | Wider tables on desktop; cards on mobile |
| Admin | Origin column + filters |

---

## 11. Admin integration

| Capability | Implementation |
|---|---|
| Distinguish Direct vs Marketplace | `origin` filter + badge on Jobs table |
| Invited technicians | Show `targetTechnicianIds` / applications with `source=invite` |
| Applications / awarded | Existing accept path + origin context |
| Response metrics | Direct: time-to-accept; Marketplace: time-to-first-app, time-to-award |
| Notification delivery | Per-job: who notified, channel, success (tie to matching audit `JobMatch`) |
| Matching quality | Marketplace only — skip for direct |

---

## 12. Performance improvements

| Issue | Fix |
|---|---|
| Broadcast sockets to all technicians | Target user rooms / matched IDs only |
| Duplicate nearby + fake scores | Single available-jobs query from JobMatch / eligibility |
| Post-create sync fan-out | Async matching worker (marketplace only) |
| Profile N+1 | Public profile already batches trust/portfolio — **render** it once |
| Preference recommendations | Cache preference profile; don’t block search on learn loop |
| Shared Assignment path | One code path for direct accept + marketplace accept side-effects |

---

## 13. Security review

| Risk | Mitigation |
|---|---|
| Customer books tech without consent | Direct job stays unassigned until technician accepts |
| Exclusive job leaked to feed | Filter `exclusiveTechnicianId` / `matchingEnabled=false` in nearby + matching |
| Phone/call abuse | Gate contact until direct accepted or marketplace assigned (policy) |
| Invite spam | Rate-limit invites per job / per day |
| Spoof origin | Server sets `origin` from auth + body rules; ignore client-only elevation |
| Chat before hire | Keep `ensureJobConversation` gated on assignment (or explicit direct-pending thread if product wants — default: after accept) |
| IDOR on direct-respond | Only `exclusiveTechnicianId` may respond |

---

## 14. Regression results

**Not executed in this pass** — audit-only deliverable. Implementation sprint must verify:

| Case | Expected |
|---|---|
| Direct booking create | Job origin direct; only target notified |
| Technician accept | Assignment + chat + tracking ready |
| Technician decline | Customer notified; job closed or convert prompt |
| Counter time + confirm | Updates schedule; then assign |
| Marketplace post | Matching (when shipped); applications; select; losers notified |
| Invite technician | Priority notify; Invited badge; can still apply |
| Notifications | Direct: 1 tech · Marketplace: eligible · Invite: invitees |
| Chat / tracking / pay / reviews | Work for both origins after assignment |
| Admin visibility | Origin + invites visible |
| Mobile + desktop | Both journeys usable |
| Regression: existing marketplace hire | Unchanged happy path with `origin=marketplace` default |

---

## Customer / Technician dashboard IA (target)

### Customer

| Bucket | Query sketch |
|---|---|
| Direct Bookings | `origin=direct_booking` |
| Marketplace Jobs | `origin=marketplace` |
| Draft Jobs | `status=draft` |
| Awaiting Applications | `marketplace` + `posted` + apps=0 or waiting |
| Awaiting Acceptance | `direct` + pending tech response |
| Active Jobs | assigned / en_route / in_progress |
| Completed | `completed` |
| Cancelled | `cancelled` |

### Technician

| Bucket | Query sketch |
|---|---|
| Invitations | direct pending + invite applications |
| Marketplace Jobs | available matched open jobs |
| Assigned Jobs | awarded, not yet started |
| Active Jobs | en_route / in_progress |
| Completed | history |

---

## Search improvements (Part 2 + 10)

### Manual search (ship first)

Expose existing + new filters in UI:

Name · Category (multi) · Location / distance · Rating · Trust · Availability · Verified only · Response speed · Recently active · Price range (from services if present) · Operating hours · Emergency available (when field exists).

### Preference learning (phase 2)

Recommend rails from: frequent categories, favourites, preferred districts, previous bookings, recent searches, ratings, emergency behaviour. **Never remove manual search.**

---

## Implementation phases (recommended)

| Phase | Scope | Risk |
|---|---|---|
| **A0** | Wire `technicianId`/`offerId` on PostJob; set `targetTechnicianIds`; notify that tech; banner “Booking {name}” — still marketplace accept **or** auto-exclusive | Low — fixes Book Now lie |
| **A1** | Add `Job.origin` + `matchingEnabled` + `exclusiveTechnicianId`; exclude exclusive from nearby | Low–medium |
| **A2** | Direct respond API (accept/decline/counter) + technician Invitations UI + customer Awaiting Acceptance | Medium |
| **A3** | `POST /jobs/:id/invite` + Invited badge | Medium |
| **A4** | Customer/Tech/Admin dashboard buckets by origin | Low |
| **A5** | Profile: portfolio, reviews, favourite, gated verified, richer search filters | Medium |
| **A6** | Preference recommendations | Lower priority |
| **M\*** | Marketplace matching Phases 0–3 from matching audit | Parallel track |

**Success criteria mapping**

| Criterion | Met by |
|---|---|
| Search and hire directly **or** post marketplace | A0–A2 + marketplace path |
| Shared backend | Single Job/Assignment (Section 6) |
| No duplicated business logic | No parallel DirectBooking pipeline |
| Targeted notifications | A0–A3 + matching audit |
| Clear CX / TX / Admin | A4 + Section 11 |

---

## Final production readiness verdict

| Area | Ready? | Notes |
|---|---|---|
| Marketplace post → apply → award | **Mostly** | Pipeline works; matching/notify need hardening |
| Direct discovery UI | **Partial** | Search + profile exist but thin |
| Direct booking | **No** | Book Now is navigation theatre |
| Invite to job | **No** | Not implemented |
| Unified origin model | **No** | Field missing; downstream already shareable |
| Chat / track / pay / review after award | **Yes** | Reuse as-is |
| Admin dual-workflow visibility | **No** | Cannot distinguish origins |
| Notifications targeted | **No** | Broadcast + admin-only publish |

**Overall:** Architecture should be **one Job model with an `origin` discriminator**, not two products. Fix the Book Now false path first (Phase A0), then exclusive direct accept (A1–A2), then invites (A3), while marketplace matching hardens in parallel.

---

## Absolute answers

1. **Does Book Now create a booking today?** **No.** It opens Post Job (often without the technician).  
2. **Is there DIRECT_BOOKING vs MARKETPLACE?** **No** — only marketplace posts.  
3. **Can invite-to-job work today?** **No** — build on Job + Application.source.  
4. **Should chat/payments/tracking be duplicated?** **No** — keep Assignment-centric.

**Await approval to implement Phases A0→A3 (and optionally matching Phase 0 in the same sprint).**
