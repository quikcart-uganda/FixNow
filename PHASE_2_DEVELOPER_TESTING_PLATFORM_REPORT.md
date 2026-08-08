# Phase 2 — Developer Testing Platform Report

**Date:** 2026-07-29  
**Depends on:** `PHASE_1_PLATFORM_CONSOLIDATION_REPORT.md`, `PLATFORM_RESTRUCTURING_AUDIT_REPORT.md`  
**Scope:** Seed Platform, Developer Technician, workflow fixtures, Seed Management UI/API — **no** Developer Preview subscriptions (Phase 3).

---

## Verdict

Phase 2 delivers a permanent sandbox Seed Platform. Developers can generate deterministic fixtures, log in as the dedicated developer technician (`quikcart2026@gmail.com`), and exercise major workflows on the real backend without touching production content.

---

## 1. Seed Platform architecture

```text
Admin UI / CLI
    ↓
seedPlatform.service  (lifecycle, validate, export)
    ↓
seedPlatform.generator  (idempotent upserts)
    ↓
fixtures.catalog + constants
    ↓
Mongo documents stamped:
  dataEnvironment = sandbox
  metadata = { generatedBy, generatedOn, seedVersion, seedTag, seedKey, … }
```

- **Does not replace** Sandbox Management (settings + legacy `sandbox-demo-v1` demo set).
- Uses Phase 1 Content Environment enforcement — production viewers never see seed rows.
- Requires `enableSandbox` for mutating operations.

| Module | Path |
| --- | --- |
| Constants | `backend/src/services/sandbox/seed/constants.ts` |
| Fixtures | `backend/src/services/sandbox/seed/fixtures.catalog.ts` |
| Generator | `backend/src/services/sandbox/seed/seedPlatform.generator.ts` |
| Service | `backend/src/services/sandbox/seed/seedPlatform.service.ts` |
| Docs | `backend/src/services/sandbox/SEED_PLATFORM.md` |
| CLI | `backend/scripts/seed-platform.ts` (`npm run seed:platform`) |

**Seed tag:** `fixnow-seed-platform-v1`  
**Version:** `2.0.0`

---

## 2. Developer Technician

| Field | Value |
| --- | --- |
| Name | Jordan Mutebi (display name after Seed Generate profile upsert; existing registration name is preserved until Generate) |
| Email | `quikcart2026@gmail.com` |
| Password | **Original registration password preserved** — Seed / integrity repair never overwrite `passwordHash` for this email. Documented `FixNowDev!2026` is reference-only for fresh installs. |
| Content env | `sandbox` |
| Flag | `metadata.developer = true` |
| Company | Mutebi Field Services |
| Plan stamp | PROFESSIONAL profile fields only (**not** Preview / no Phase 3 temp grants) |

Visible only as sandbox content (Phase 1 filters). Generate via Seed Platform when sandbox is enabled.

---

## 3. Workflow fixtures

Permanent jobs `F01`–`F17`:

| ID | Purpose | Typical status |
| --- | --- | --- |
| F01 | Waiting for applications | `posted` |
| F02 | Customer invited technician | `posted` + recommended |
| F03 | Applications received | `posted` + pending apps |
| F04 | Application withdrawn | withdrawn app |
| F05 | Technician selected | shortlisted |
| F06 | Accepted / assigned | `assigned` |
| F07 | Travelling | `technician_en_route` |
| F08 | Arrived | `in_progress` + timeline |
| F09 | Work started | `in_progress` |
| F10 | Photo uploads | `in_progress` + photos |
| F11 | Customer chat | `assigned` + messages |
| F12 | Pending completion | `awaiting_confirmation` |
| F13 | Customer confirmation | `awaiting_confirmation` |
| F14 | Completed | `completed` |
| F15 | Cancelled | `cancelled` |
| F16 | Rejected application | rejected app |
| F17 | Disputed | `disputed` |

Plus `HX01`–`HX06` completed history jobs for review diversity.

---

## 4. Seed customers

| Name | Email | District |
| --- | --- | --- |
| Sarah Nakato | `sarah.nakato@fixnow.seed` | Kampala |
| David Kato | `david.kato@fixnow.seed` | Wakiso |
| Grace Achieng | `grace.achieng@fixnow.seed` | Jinja |
| James Mugisha | `james.mugisha@fixnow.seed` | Kampala |
| Aisha Kyomuhendo | `aisha.kyomuhendo@fixnow.seed` | Kampala |
| Peter Musoke | `peter.musoke@fixnow.seed` | Wakiso |

Shared password: `SeedPlatform!2026`

---

## 5. Seed technicians

- **1 developer technician** (Jordan Mutebi)
- **6 supporting techs** (plumbing, solar, painting, locksmith, AC, networking) with company branding

---

## 6. Job fixtures

Realistic Ugandan titles/descriptions/budgets/locations across plumbing, electrical, solar, painting, cleaning, locksmith, networking, roofing, AC, phone repair, generator, CCTV, water pumps, automotive. Photos via deterministic Picsum seeds.

---

## 7. Reviews

Seven seeded reviews (excellent → poor, long/short) on completed fixtures/history jobs, with matching `Rating` documents.

---

## 8. Portfolios

Each seeded technician gets:

- Public portfolio + before/after + detail media
- Case study
- Certificate

---

## 9. Avatar library

Expanded DiceBear catalogue (+20), including `avatar-seed-dev-01` for the developer technician. Still served at `/public/avatars`.

---

## 10. Seed Management module

**Admin UI:** `/admin/settings/seed-platform` (`SeedPlatformPage`)  
**Nav:** Seed Platform (alongside Sandbox Management)

Actions: Generate All, module generators, Reset, Delete, Archive, Export, Import (catalogue regenerate), Validate.

---

## 11. Database changes

- `createSchema` now includes optional `metadata` Mixed on all models (`metadataPlugin` in `models/shared/base.ts`) so seed provenance is consistent.
- No new collections. Company presence = technician profile company fields (no Company model).

---

## 12. APIs

| Method | Path |
| --- | --- |
| GET | `/admin/seed-platform` |
| POST | `/admin/seed-platform/generate` |
| POST | `/admin/seed-platform/generate-all` |
| POST | `/admin/seed-platform/reset` |
| POST | `/admin/seed-platform/delete` |
| POST | `/admin/seed-platform/archive` |
| GET | `/admin/seed-platform/export` |
| POST | `/admin/seed-platform/import` |
| GET | `/admin/seed-platform/validate` |
| GET | `/admin/seed-platform/sections/:section` |

Client: `packages/api/seedPlatformApi.ts`

Super-admin only. Mutating calls assert sandbox enabled.

---

## 13. Validation

| Check | How |
| --- | --- |
| Developer technician exists | Overview / Validate / login |
| Sandbox-only | `dataEnvironment=sandbox` + Phase 1 filters |
| Workflow coverage | F01–F17 listed in UI + validate |
| Apps / chats / reviews / portfolios / offers | Generator modules |
| Production isolation | Guests & production users never query sandbox |
| Android = Web | Same APIs; login as seed accounts |

### Smoke steps

1. Enable Sandbox Management.
2. Admin → Seed Platform → **Generate All** (or `npm run seed:platform` in `backend/`).
3. Login technician: `quikcart2026@gmail.com` / `FixNowDev!2026`.
4. Confirm jobs feed shows F01–F05 style fixtures; open F11 for chat; F12/F13 for completion; portfolio & offers present.
5. Login customer `sarah.nakato@fixnow.seed` / `SeedPlatform!2026` for customer-side confirmation UX.
6. Production account Home must not list seed offers/jobs.

---

## 14. Remaining work before Phase 3

1. **Developer Preview subscriptions** — temporary plan grants via entitlement engine (explicitly deferred).
2. Honest `Subscription` documents for seed techs (optional; today profile stamps only).
3. Richer import (full JSON rehydrate vs catalogue regenerate).
4. Wire seed AI conversations deeper into assistant UX if needed.
5. Optional: suspend seed logins when sandbox setting is disabled.
6. Expand category catalogue if niche fixture categories are missing locally.

---

## Explicit non-goals (confirmed)

- No Developer Preview plans  
- No temporary billing subscriptions  
- No production seed writes  
- Sandbox Management left intact for legacy demo dataset  

Phase 2 is complete when Generate All succeeds and the developer technician can exercise the major FixNow workflows from the seeded fixture set in sandbox only.
