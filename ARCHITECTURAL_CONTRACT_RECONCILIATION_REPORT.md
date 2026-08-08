# Architectural Contract Reconciliation Report

**Date:** 2026-08-08  
**Branch:** `clean-master`  
**Failed Render commit:** `3ec7721` (“Fix Mongoose Schema generics…”)  
**Scope:** Technician Approval ↔ Profile Completion ↔ `ITechnicianProfile` ↔ Seed Platform ↔ Development Sandbox

---

## 1. Root cause timeline

| When | What landed | Contract state |
|------|-------------|----------------|
| Earlier (`3172484` and prior WIP) | Profile completion scoring existed with a **minimal** `ProfileCompletionResult` (`percent`, `canApply`, `sections`, …) and `ITechnicianProfile` **without** account-approval fields. | Consistent with completion-only usage. |
| Feature wave (local / partial push) | **Technician Approval Workflow** (`technicianApproval.service.ts`), Seed Platform approve/reject paths, and Development Subscription Simulator were written against an **extended** contract: approval timestamps/modes on the profile document, plus `REQUIRED_APPROVAL_SECTION_IDS`, `canSubmitForApproval`, `requiredMissing` on completion. | Services assumed the extended contract. |
| `3ec7721` (Render) | Mongoose `createSchema` generics were fixed so `InferSchemaType` no longer collapsed to `Document<unknown>`. That made TypeScript **honest**: models typed as `ITechnicianProfile` now surface only fields that exist on the interface. Simultaneously, approval + seed services that already referenced approval fields were part of the tree. | **Drift exposed:** services/schema consumers ≠ committed interface/completion exports. |
| This reconciliation | Align schema, interface, completion result/exports, validators, routes, seed generator/service, and simulator import **together**. | Contract consistent; `tsc` green. |

**Verdict:** Render did not invent new errors. Commit `3ec7721` correctly typed Mongoose documents as `ITechnicianProfile`, which revealed that Approval + Seed had been shipped **ahead of** the model and `ProfileCompletionResult` contracts that were still on HEAD.

---

## 2. Which previous feature introduced each mismatch

| Mismatch | Introduced by | Broken against |
|----------|---------------|----------------|
| Missing `approval*` fields on `ITechnicianProfile` / schema | Technician Approval Workflow (+ Seed Platform admin actions) | Committed `Technician.ts` (pre-reconciliation) |
| Missing `REQUIRED_APPROVAL_SECTION_IDS` export | Technician Approval Workflow import | Committed `profileCompletion.service.ts` |
| Missing `canSubmitForApproval` / `requiredMissing` on `ProfileCompletionResult` | Technician Approval + Profile Setup UI | Committed completion result type (older “apply gate” shape only) |
| Bad import `../sandbox/seed/constants.js` | Development Subscription Simulator (file already under `sandbox/seed/`) | Path assumed a nested `sandbox/sandbox/seed` layout |
| Seed reads/writes `approvalSource` / `approvalSubmittedAt` / clear-all approval fields | Seed Platform | Same missing profile fields |
| Seed generator sets `verificationStatus: APPROVED` without approval metadata | Seed Platform generator | Incomplete seed ↔ approval contract |

**Not the root cause:** RBAC, Capability Engine, Platform Governance, Production Mode, or Development Transaction IDs — they did not define these fields. They remain consumers of unrelated contracts.

---

## 3. Dependency map (Phase 1)

```
ITechnicianProfile / TechnicianProfile model
  ├─ technicianApproval.service.ts   (read/write all approval*)
  ├─ seedPlatform.service.ts         (approve/reject/reset + list projections)
  ├─ seedPlatform.generator.ts       (seed APPROVED technicians)
  ├─ profileCompletion.service.ts    (reads profile for sections)
  ├─ technician.service.ts           (approval gate via policy)
  └─ jobs: processTechnicianApprovalQueue

ProfileCompletionResult + REQUIRED_APPROVAL_SECTION_IDS
  ├─ technicianApproval.service.ts   (submit gate + status DTO)
  ├─ technicianController.profileCompletion
  ├─ job.service.ts (assertProfileCompleteEnoughToApply)
  └─ apps/technician ProfileSetupPage (canSubmit / requiredMissing)

Approval workflow API
  ├─ GET/POST /technicians/me/approval*
  ├─ GET/PUT  /admin/settings/technician-approval
  ├─ GET/POST /admin/technician-approvals*
  └─ PlatformSetting key marketplace.technician_approval

Seed / Sandbox
  ├─ seedPlatform.service.ts / generator.ts
  ├─ developmentSubscriptionSimulator → ./constants.js (DEVELOPER_TECHNICIAN)
  └─ developmentTransaction.service.ts (orthogonal; no approval fields)
```

---

## 4. Contract matrix (Phase 2–3)

### 4.1 Approval fields on technician profile

| Field | Schema | Interface | DTO (API status/list) | Validation | Seed service | Seed generator | Migration |
|-------|--------|-----------|------------------------|------------|--------------|----------------|-----------|
| `approvalSubmittedAt` | Yes | Yes | Yes (`submittedAt`) | N/A (server-set) | Yes (clear/reset) | Cleared on seed APPROVED | Additive optional — none required |
| `approvalDeadlineAt` | Yes + index | Yes | Yes (`deadlineAt`) | N/A | Yes | Cleared | Additive |
| `approvalMode` | Yes + enum | Yes | Yes (`mode`) | Policy schema | Yes | `automatic` on seed | Additive |
| `approvalSource` | Yes + enum | Yes | Yes (`source`) | N/A | Yes | `seed` | Additive |
| `approvalReviewedAt` | Yes | Yes | Yes (`reviewedAt`) | N/A | Yes | Set on seed | Additive |
| `approvalReviewedBy` | Yes (ObjectId→User) | Yes | (admin-internal) | N/A | Yes | — | Additive |
| `approvalPolicyVersion` | Yes | Yes | Yes (`policyVersion`) | Policy schema | Yes (clear) | `1` | Additive |
| `approvalAdminNote` | Yes | Yes | Yes (`adminNote`) | Review `note` | Yes | Cleared | Additive |
| `approvalRemindersSent` | Yes | Yes | (queue-internal) | N/A | Yes | `[]` | Additive |

### 4.2 ProfileCompletionResult (approval-facing)

| Property / export | Expected by approval service | Actual after reconciliation |
|-------------------|------------------------------|-----------------------------|
| `REQUIRED_APPROVAL_SECTION_IDS` | Imported export | Exported `Set` of required section ids |
| `canSubmitForApproval` | Submit + status gate | Computed: all `classification: 'required'` sections complete |
| `requiredMissing` | Status + UI | Array of incomplete required sections |
| `requiredPercent` / `profileScore` / `trustEnhancingPercent` | Completion UX | Present on result |
| Section ids `identity`, `profession`, `district`, `photo`, `skills`, `experience` | Must match required set | Marked `classification: 'required'` |

### 4.3 Import / path contracts

| Consumer | Expected | Was (HEAD) | Now |
|----------|----------|------------|-----|
| `developmentSubscriptionSimulator.service.ts` | `./constants.js` | `../sandbox/seed/constants.js` (broken) | `./constants.js` |

---

## 5. Mismatch catalog (Phase 4) — resolved

| ID | Expected | Actual on `3ec7721` | Resolution |
|----|----------|---------------------|------------|
| M1 | Approval fields on `ITechnicianProfile` | Absent | Added to interface + mongoose schema + compound index |
| M2 | Same fields persistable | Schema ended at `searchKeywords` | Schema fields + indexes |
| M3 | `REQUIRED_APPROVAL_SECTION_IDS` export | Missing export | Exported from `profileCompletion.service.ts` |
| M4 | `canSubmitForApproval` / `requiredMissing` | Missing on type + return | Extended type + compute path |
| M5 | Simulator → seed constants | Wrong relative path | Fixed to `./constants.js` |
| M6 | Seed APPROVED techs carry approval metadata | Only `verificationStatus` | Generator writes `approvalSource: 'seed'`, policy version, clears pending fields |
| M7 | Admin review / policy bodies validated | Routes unvalidated body | `reviewTechnicianApprovalSchema`, `updateTechnicianApprovalPolicySchema` |
| M8 | `approvalReviewedBy` assignment | `admin.userId as never` | `new Types.ObjectId(admin.userId)` (no suppressions / unsafe casts) |

**Migrations:** No formal migration scripts in this repo. Fields are optional; existing documents remain valid. Grandfather / seed / submit paths populate fields at runtime.

---

## 6. Files modified (Phase 5 — layers updated together)

| Layer | File |
|-------|------|
| Schema + interface | `backend/src/models/technician/Technician.ts` |
| Completion contract | `backend/src/services/marketplace/profileCompletion.service.ts` |
| Approval service | `backend/src/services/marketplace/technicianApproval.service.ts` |
| Validation / DTO | `backend/src/validators/index.ts` |
| API routes | `backend/src/routes/index.ts` |
| Seeder (admin actions) | `backend/src/services/sandbox/seed/seedPlatform.service.ts` |
| Seeder (generation) | `backend/src/services/sandbox/seed/seedPlatform.generator.ts` |
| Dev sandbox | `backend/src/services/sandbox/seed/developmentSubscriptionSimulator.service.ts` |
| Report | `ARCHITECTURAL_CONTRACT_RECONCILIATION_REPORT.md` |

API controllers already returned service DTOs; no parallel DTO package existed — validators + service return shapes are the API contract.

---

## 7. Why the architecture is now internally consistent

1. **Single source of truth for profile shape:** `ITechnicianProfile` and `createSchema<ITechnicianProfile>(…)` both declare the same approval fields, so HydratedDocument / lean FlattenMaps expose them to Approval and Seed.
2. **Single source of truth for submit eligibility:** Required section ids and `canSubmitForApproval` / `requiredMissing` live in `profileCompletion.service.ts`; Approval consumes them instead of inventing a second checklist.
3. **Seed mirrors production approval semantics:** Generated APPROVED technicians are marked `approvalSource: 'seed'` rather than appearing as mysteriously approved with no metadata.
4. **API inputs match service actions:** Zod schemas enumerate the same review actions and policy knobs the service accepts.
5. **No TypeScript suppressions:** `any` / `unknown` escape hatches / `@ts-ignore` / `as never` were not used to silence drift; ObjectId assignment uses `Types.ObjectId`.

---

## 8. Build validation

| Check | Result |
|-------|--------|
| `npm run typecheck` (backend) | **Pass** (`tsc -p tsconfig.json --noEmit`) |
| `npm run build` (backend) | **Pass** (`tsc -p tsconfig.json`) |
| Suppressions introduced | **None** |
| Render | Requires push of this reconciliation to `clean-master` (deploy branch). Prior failure on `3ec7721` is explained by missing interface/completion exports, not by the Mongoose generic fix itself. |

`npm run dev` / live Render health should be verified after deploy (`/livez`, `/readyz`, `/diagnostics`). Local Atlas SRV may still fail on restricted networks; that is environmental, not contract drift.

---

## 9. Operator notes

1. Keep Render **branch = `clean-master`**, **rootDir = `backend`**.
2. After deploy of this commit, confirm build succeeds before chasing runtime Mongo connectivity.
3. Do not reintroduce approval fields only in services — always update schema + interface + seed + validators together.
