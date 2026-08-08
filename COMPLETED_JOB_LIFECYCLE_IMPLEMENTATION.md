# Completed Job Lifecycle & Free Job Accounting Implementation

**Date:** 2026-07-28  
**Scope:** Backend, Customer Web, Technician Web, Admin, API client, notifications, audit, analytics hooks  
**Android:** Same Capacitor web bundle — no platform-specific fork

---

## 1. Architecture implemented

Canonical lifecycle (unchanged status vocabulary, enriched payloads):

```
posted → assigned → technician_en_route → in_progress
  → awaiting_confirmation   (technician requestCompletion)
  → completed               (customer confirmCompletion)  ← ONLY quota-counting state
  OR → in_progress          (customer reportCompletionIssue)
```

**Single source of truth for free-job accounting:**  
Customer-confirmed `completed` jobs with `Job.freeJobSlotConsumed === true`.

Deductions never occur on: browse, notify, apply, shortlist, hire, start work, or request completion.

Dedicated service: `backend/src/services/marketplace/jobCompletion.service.ts`  
Quota engine: `backend/src/services/marketplace/freeJob.service.ts`  
Status machine: existing `jobTransitions.ts` (`awaiting_confirmation` ↔ `completed` / `in_progress`)

---

## 2. Database changes

### Job (`Job` model)
| Field | Purpose |
|---|---|
| `completionRequest` | notes, photos, materials, estimate, technician confirm flag, requestedAt |
| `completionIssue` | category, description, photos, comments when customer rejects |
| `freeJobSlotConsumed` | Idempotency — quota deducted at most once per job |
| `freeJobConsumedAt` | When quota was claimed |
| `confirmedCompletedBy` | Customer/admin who confirmed |

### TechnicianProfile
| Field | Purpose |
|---|---|
| `completedJobsUnderFreePlan` | Mirrors free-plan completions (`freeJobsUsed`) |
| `promotionalFreeJobs` | Admin bonus grants tracking |
| `lastCompletedJobAt` / `lastCompletedJobId` | Last customer-confirmed completion |
| `subscriptionStatus` | `none` \| `trialing` \| `active` \| … \| `required` |
| `trialFinished` | Set when free quota exhausted |
| `monetizationSuspended` | Per-tech emergency bypass |

Existing `freeJobLimit`, `remainingFreeJobs`, `freeJobsUsed`, `jobsCompleted` remain authoritative counters.

### PlatformSetting `marketplace.free_jobs`
Expanded monetization config (no hardcoded product limits in code paths that matter):

- `enabled`, `defaultLimit`, `lockAfterLimit`
- `requireCustomerConfirmation` (default true)
- `autoCompleteTimeoutHours`
- `subscriptionEnabled`
- `gracePeriodDays`
- `freePlanEnabled`
- `monetizationSuspended`

---

## 3. API changes

| Method | Path | Role | Effect |
|---|---|---|---|
| `POST` | `/jobs/:id/request-completion` | technician, admin | → `awaiting_confirmation` + completion package |
| `POST` | `/jobs/:id/confirm-completion` | customer, admin | → `completed` + atomic quota deduct |
| `POST` | `/jobs/:id/report-completion-issue` | customer, admin | → `in_progress` + issue record (no quota) |
| `POST` | `/jobs/:id/reopen` | admin | Completed → in progress (quota not auto-refunded) |
| `GET` | `/technicians/me/quota` | technician | Quota snapshot + completion history |
| `GET` | `/admin/technicians/:id/quota` | admin | Same for a technician |
| `PUT` | `/admin/settings/free-jobs` | admin | Full monetization config |
| `POST` | `/admin/technicians/:id/free-jobs` | admin | Adjust limit/remaining/promo/plan |
| `POST` | `/admin/technicians/:id/free-jobs/reset` | admin | Reset to platform default |
| `POST` | `/admin/technicians/:id/free-jobs/bonus` | admin | Grant promotional jobs |

Legacy `PATCH /jobs/:id/status` still works; completion UX prefers dedicated endpoints.

**Client:** `packages/api/jobsApi.ts`, `technicianApi.getQuota()`, `adminApi` quota helpers.

---

## 4. Admin changes

- **Marketplace Monetization** page (`/admin/free-jobs`, nav renamed)
- Controls: free plan on/off, customer confirmation required, auto-complete timeout, grace period, subscription enforcement flag, suspend monetization
- Per-technician override / unlock / bonus / reset APIs wired
- Technician drawer continues to show remaining free jobs / credits

---

## 5. Technician UI changes

- **Mark Work Complete** opens `MarkWorkCompleteDialog` (notes, materials, photo URL, confirm checkbox)
- Submits `requestCompletion` — status becomes awaiting confirmation, **not** completed
- Awaiting state shows locked “Waiting for customer confirmation”
- `JobCompletePage` is a locked waiting screen (no post-submit edits)
- `LockedPage` copy: free completed jobs exhausted; browse/history allowed; apply blocked
- Active jobs list routes “Mark Work Complete” into the dialog flow

---

## 6. Customer UI changes

- On `Awaiting Confirmation`, `JobTrackingPage` shows Confirm Completion / Report an Issue
- `CustomerCompletionActions` dialog:
  - Confirm → `confirmCompletion`
  - Report → category + description (+ optional photo/comments) → back to In Progress
- Reviews remain gated on `completed` (existing `assertCompletedJob`)

---

## 7. Notification flow

| Event | Recipient | Type |
|---|---|---|
| Completion requested | Customer | `job.completion_requested` |
| Completion confirmed | Technician | `job.completion_confirmed` |
| Review prompt | Customer | `review.request` |
| Issue reported | Technician | `job.completion_issue` |
| Quota decreased | Technician | `technician.quota_decreased` |
| Last / exhausted | Technician (+ admins if locked) | `technician.locked` / `technician.subscription_required` |
| Job completed (system) | Both | `job.completed` (existing) |

Realtime: existing `job:status_changed` / `job:completed` / `technician:free_job_limit_updated`.

---

## 8. Validation results

| Rule | Enforcement |
|---|---|
| Customer confirms once | `status === completed` → conflict; `freeJobSlotConsumed` claim is atomic |
| Quota deducted once | `Job.findOneAndUpdate({ freeJobSlotConsumed: { $ne: true } })` |
| Cannot complete twice | Transition + conflict errors |
| Cannot bypass confirmation | Only customer/admin can set `completed`; tech can only request |
| Apply blocked at zero | `assertCanApplyToJobs` — message updated for subscription prep |
| Existing active jobs continue | Status machine unchanged for earlier stages |
| Reviews after confirm | Existing review service requires `completed` |
| Stats update | `jobsCompleted`, free counters, customer `jobStats.completed`, trust recompute |

---

## 9. Security protections

- Role authorization on every completion endpoint
- Assigned-technician / job-owner checks
- Zod validation on request bodies
- Audit logs: `job.completion_requested`, `job.completion_confirmed`, `job.completion_issue_reported`, `quota.deducted`, `admin.override_free_jobs`, `admin.reset_quota`, `admin.grant_bonus_jobs`, `job.reopened`
- Remaining never negative (`Math.max(0, …)`)
- Notifications/escrow/referral side-effects cannot roll back confirmed completion after status save (same pattern as before)

---

## 10. Future subscription integration points

| Hook | Ready field / config |
|---|---|
| Plan catalogue | `SubscriptionPlan` / `Subscription` models (existing Future schemas) |
| Enforcement flag | `marketplace.free_jobs.subscriptionEnabled` |
| Technician state | `subscriptionStatus`, `subscriptionPlanCode`, `trialFinished` |
| Apply gate message | Already points technicians to upgrade when remaining = 0 |
| Upgrade UI | `/technician/upgrade` + Locked page |
| Billing | Not implemented — checkout remains future work |

When billing ships: keep `consumeFreeJobSlotForCompletion` as the only deduct path; paid plans set `remainingFreeJobs` / unlock without changing completion semantics.

---

## Key files

**Backend:** `jobCompletion.service.ts`, `freeJob.service.ts`, `job.service.ts` (completion hook), `Job.ts`, `Technician.ts`, routes/controllers/validators  

**API:** `jobsApi.ts`, `technicianApi.ts`, `adminApi.ts`, `types/admin.ts`  

**UI:** `MarkWorkCompleteDialog.tsx`, `CustomerCompletionActions.tsx`, `AssignedJobPage.tsx`, `ActiveJobsPage.tsx`, `JobTrackingPage.tsx`, `JobCompletePage.tsx`, `LockedPage.tsx`, `FreeJobsPage.tsx`, `AdminShell.tsx`

---

## Analytics

Tracked via existing job completion + free-job socket events and audit meta. Recommended queries:

- Completions: `Job` where `status=completed` and `freeJobSlotConsumed=true`
- Issue rate: jobs with `completionIssue` / completion requests
- Confirmation delay: `completedAt - completionRequest.requestedAt`
- Quota usage: `TechnicianProfile.completedJobsUnderFreePlan / freeJobLimit`
- Conversion prep: technicians with `subscriptionStatus=required` or `trialFinished=true`
