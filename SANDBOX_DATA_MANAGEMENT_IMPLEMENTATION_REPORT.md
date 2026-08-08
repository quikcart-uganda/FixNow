# Sandbox Data Management Implementation Report

**Date:** 2026-07-28  
**Product:** FixNow Development Sandbox Data Platform  
**Depends on:** Admin Role Transition, Platform AI Orchestration, Web↔Android Synchronization architecture

---

## 1. Sandbox architecture

FixNow keeps **one database and one business engine**. Isolation is achieved by tagging every marketplace document with a **`dataEnvironment`** field rather than duplicating tables.

```
Admin Sandbox Management
        │
        ▼
sandbox.service + demoData.generator
        │
        ▼
Same models / job / application / offer services
        │
        ▼
dataEnvironment ∈ { production | sandbox | development | demo | archived }
        │
        ▼
Query filters (applyDataEnvironment) on list / search / apply / analytics
```

Capacitor Android inherits the same SPA and APIs — avatar picker and sandbox isolation apply on Web and Android automatically.

---

## 2. Environment isolation strategy

| Value | Purpose |
|-------|---------|
| `production` | Real users (default for existing untagged docs) |
| `sandbox` | Primary demo / QA dataset |
| `development` | Engineer scratch data |
| `demo` | Marketing / pitch datasets |
| `archived` | Soft-retired sandbox content |

**Rules**

- Plugin on `createSchema` stamps every new document (`backend/src/models/shared/base.ts`).
- Untagged legacy documents are treated as **production** in filters.
- Job create inherits the customer’s environment.
- Technician job browse / apply and technician search filter by the actor’s environment.
- Cross-environment apply is rejected (`assertSameDataEnvironment`).
- Production users never see sandbox jobs/technicians in marketplace lists.

---

## 3. Demo customer generation

Realistic Ugandan personas (emails `@fixnow.demo`):

| Name | Location |
|------|----------|
| Sarah N. | Kololo, Kampala |
| David K. | Entebbe / Wakiso |
| Grace A. | Jinja |
| James M. | Ntinda, Kampala |

Each has phone (`+256…`), avatar, bio, and geo point. Password for all demo accounts: `SandboxDemo!2026`.

---

## 4. Demo technician generation

Twelve technicians across categories: Electrical, Plumbing, Automotive, Cleaning, Painting, Carpentry, Welding, Solar, Air Conditioning, Appliance Repair, Locksmith, Phone Repair.

Each includes: avatar, headline, bio, skills, ratings, completed jobs, plan (Starter / Professional / Business), district, and a sample approved offer.

---

## 5. Demo job generation

Jobs span workflow stages: posted, assigned, in progress, awaiting confirmation, completed, cancelled — with applications where relevant (leaking tap, solar inverter, house paint, gate motor, fridge, ceiling lights, washing machine, TV mount, office network, CCTV).

All use the **real** Job / JobApplication models and status enums.

---

## 6. Sandbox Management module

**Admin path:** `/admin/settings/sandbox` (System Settings · Super Admin)

**API:** `/admin/sandbox/*` + public `/public/avatars`

**UI sections**

- Environment count cards (sandbox / production / demo)
- Settings: enable sandbox, hide from reports, allow avatars, require real photos
- Actions: Create, Regenerate, Delete, Archive, Suspend, Reactivate, Reset, Export
- Preview tabs: customers, technicians, jobs, offers (Promote on offers)
- Analytics view switcher: production / sandbox / combined

---

## 7. Promotion-to-production workflow

- **Clone only** — originals stay in sandbox.
- Implemented for `TechnicianOffer` (clone enters production as `pending`).
- Extensible list: PlatformPromotion, SponsoredContent, ContentBlock, Category, CmsPage, PortfolioItem.
- **Never promote:** Payments, Subscriptions, Auth/Sessions, Messages, Notifications, Audit logs, Applications, AI conversations.

---

## 8. Environment-aware AI behaviour

`SafeAiRoleContext.dataEnvironment` is resolved from the user record (never inferred by AI).

### Full implementation

1. **AiToolContext** carries `dataEnvironment: DataEnvironment` — set once from `roleContext.dataEnvironment`.
2. **Tool-level filtering** — Every AI tool (customer, technician, admin) uses `envScopedRequest(ctx, ...)` attaching `auth.dataEnvironment` to downstream marketplace queries that apply `dataEnvironmentFilter()`.
3. **Platform canon** — `fixnow.canon.ts` includes "Data environment isolation" rules: never combine environments, vector search respects filter, AI cannot switch environments.
4. **Orchestration payloads** — `prepareCreateJob`, `prepareCancelJob`, `prepareAvailabilityUpdate` stamp `dataEnvironment` into payload.
5. **Audit logging** — `AiActionAudit` records `dataEnvironment` on every tool run, navigation, and pending action. `cross_env_blocked` action type logs blocked cross-environment attempts. Index: `{ dataEnvironment: 1, createdAt: -1 }`.
6. **Execution order** — Environment → Role → Permissions → Query Only Allowed Environment → Execute → Return.

### Enforcement matrix

| Rule | Mechanism |
|------|-----------|
| Production AI ignores sandbox data | `dataEnvironmentFilter('production')` before query |
| Sandbox AI ignores production data | `dataEnvironmentFilter('sandbox')` before query |
| Cross-environment applications blocked | `assertSameDataEnvironment()` in job.service |
| AI cannot switch environments | Read-only from user record |
| Pending actions scoped | `payload.dataEnvironment` from context |
| Every AI action audited with env | `AiActionAudit.dataEnvironment` field |
| LLM warned for non-production | System prompt extras + canon rules |

Prompt formatting adds:

- Explicit `Data environment: …`
- Critical warning when not production: do not claim or drive production side-effects.

Job orchestration still uses the same `jobService.create`, which stamps the customer’s environment — sandbox AI chats create sandbox jobs.

---

## 9. Avatar library implementation

- Backend catalogue: `backend/src/services/sandbox/avatarLibrary.ts` (40+ diverse avatars).
- Collections: professional, friendly, casual, illustrated, modern-flat (+ soft realist style).
- Public API: `GET /public/avatars`, `GET /public/avatars/:id`.
- Admin can gate collections via sandbox settings.

---

## 10. Profile photo management

`CustomerProfile` / `TechnicianProfile` fields:

| Field | Role |
|-------|------|
| `photoUrl` | Active display image |
| `avatarId` | Selected library avatar (kept when uploading a real photo) |
| `uploadedPhotoUrl` | Last real upload (restored path uses avatar when cleared) |

`ProfilePhotoPicker` (shared Web + Android): Take photo · Gallery · Choose avatar · Use avatar instead.

Update APIs accept `avatarId`, `uploadedPhotoUrl`, `clearUploadedPhoto`.

---

## 11. Backend changes

| Area | Path |
|------|------|
| Constants | `backend/src/constants/dataEnvironment.ts` |
| Schema plugin | `backend/src/models/shared/base.ts` |
| Helpers | `backend/src/services/sandbox/dataEnvironment.ts` |
| Settings | `backend/src/services/sandbox/sandboxSettings.service.ts` |
| Avatars | `backend/src/services/sandbox/avatarLibrary.ts` |
| Generator | `backend/src/services/sandbox/demoData.generator.ts` |
| Service | `backend/src/services/sandbox/sandbox.service.ts` |
| Controllers / routes | `controllers/index.ts`, `routes/index.ts` |
| Isolation | `job.service.ts`, `technician.service.ts` |
| AI | `services/ai/context/context.manager.ts` |
| Profiles | `customer.service.ts`, `technician.service.ts` + model fields |

---

## 12. Database changes

- Additive field `dataEnvironment` (indexed, default `production`) on all `createSchema` models.
- Additive `avatarId`, `uploadedPhotoUrl` on customer/technician profiles.
- PlatformSetting key `sandbox_data_platform` for admin configuration.
- No new collections required for core isolation.

---

## 13. API updates

| Method | Path |
|--------|------|
| GET | `/admin/sandbox` |
| PATCH | `/admin/sandbox/settings` |
| POST | `/admin/sandbox/demo/{create,regenerate,delete,archive,suspend,reactivate,reset}` |
| GET | `/admin/sandbox/export` |
| GET | `/admin/sandbox/sections/:section` |
| POST | `/admin/sandbox/promote` |
| GET | `/admin/sandbox/analytics` |
| GET | `/public/avatars`, `/public/avatars/:id` |

Client: `packages/api/sandboxApi.ts` (exported from `@fixnow/api` and `@fixnow/api/admin`).

---

## 14. Validation results

| Check | Status |
|-------|--------|
| Sandbox jobs filtered from production nearby/list | Implemented via `applyDataEnvironment` |
| Production jobs filtered from sandbox actors | Same |
| Cross-environment apply blocked | `assertSameDataEnvironment` on apply |
| Demo generator stamps `dataEnvironment=sandbox` | Yes |
| Promote clones offer (does not move) | Yes |
| Avatar library public + picker | Yes |
| Photo ↔ avatar switch fields | Yes |
| AI knows sandbox vs production | `dataEnvironment` in context + prompt |
| Same backend logic for sandbox workflows | Yes (shared services) |
| Admin Sandbox Management UI | `/admin/settings/sandbox` |
| Web + Android share picker | Shared SPA |

**Manual QA recommended**

1. Super Admin → Sandbox Management → Create Demo Data.  
2. Login as `sarah.n@fixnow.demo` / `SandboxDemo!2026` — see only sandbox jobs.  
3. Login as a production customer — sandbox jobs absent.  
4. Sandbox technician cannot apply to a production job.  
5. Promote a sandbox offer → production pending clone exists; original remains.  
6. Profile photo → choose avatar → upload photo → “Use avatar instead”.

---

## 15. Launch transition recommendations

1. Keep `enableSandbox` on in staging; leave off (or tightly controlled) in production until launch prep.  
2. Before launch, **Promote** reusable offers / CMS / promotions only — never payments or messages.  
3. **Archive** or **Delete** demo users before opening production traffic.  
4. Run analytics on **production** view by default (`hideSandboxFromReports=true`).  
5. After first Super Admin transition (see Admin Role Transition report), only Super Admins manage sandbox.  
6. Rebuild Android with `mobile:sync` after shipping avatar picker so Capacitor assets include the UI.  
7. Extend promote handlers for CMS / promotions when those launch assets are ready.  
8. Optionally backfill `dataEnvironment: 'production'` on legacy documents for simpler queries.

---

*Sandbox workflows use the same FixNow backend as production. Isolation is environmental tagging + query boundaries — not a second product.*
