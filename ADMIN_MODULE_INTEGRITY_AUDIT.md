# Admin Module Integrity Audit

**Date:** 26 July 2026  
**Scope:** Verification Center, Marketing, Lock Management, Audit Logs, media pipeline, hard-coded content, module guidance  
**Constraint:** No rewrites of working modules; reuse existing architecture; production-safe dual-path fallbacks only where APIs are absent.

---

## Phase 1 — Audit findings

| Module | Finding | Severity | Root cause |
|---|---|---|---|
| Verification Center | Placeholder “coming soon” + redirect to Technicians | P0 | `verificationService` was `notImplemented`; UI never called a real queue |
| Verification API | Routes existed but ignored `req` | P0 | Controller stubs called service with no arguments |
| Marketing | Already backend-driven via `marketingApi` / content blocks | — | Not mock data; seed only populates DB |
| Marketing detail | List cards lacked detail drawers / media preview | P1 | UI showed title/status only |
| Lock Management | Partial workspace; unlock queue hardcoded `0` / “Not available yet” | P0 | No `unlockRequestedAt` field; unlock requests never persisted |
| Audit Logs | Placeholder despite live `/audit-logs` API | P0 | Page never called `adminApi.auditLogs` |
| Avatars / images | Broken icons across admin | P0 (prior) | Default SVG / unresolved URLs; fixed globally via `ProfileAvatar` + `LazyImage` + `resolveMediaUrl` |
| Subscriptions | Empty “not available” | P2 | Phase-2 API not shipped — intentional scaffold |
| Dynamic Pricing | Explicit future module | P2 | Documented as not live |
| Hard-coded business content | No production mock campaign arrays in admin pages | — | Marketing enums are schema constants, not business content |

### Verification redirect verdict

Redirecting “Open pending technicians” into Technician Management was a **temporary fallback**, not the intended architecture.  
Verification Center is now the dedicated document queue. Technician Management remains a **graceful fallback** only if the verification API is unavailable (explicit banner).

---

## Verification Center implementation

**Backend**

- New `backend/src/services/verification/verification.service.ts`
  - `submit` — technician (or admin) creates `IdentityVerification`
  - `listPending` — unified queue: identity + skill evidence + certifications
  - `review` — approve / reject / request_info; syncs `TechnicianProfile.verificationStatus` / `identityVerified` / `skillVerified`
- Expanded document types: national ID, passport, driving license, LC1, selfie, certificate, police clearance, business registration, professional licence, other
- Controllers now pass `req` / `auth` / body correctly
- Wired in `backend/src/services/index.ts` (replaced `notImplemented`)

**Frontend**

- `packages/api/verificationApi.ts`
- `apps/admin/pages/VerificationPage.tsx` — queue, filters, detail drawer, document thumbs (`LazyImage`), ID/selfie compare, notes, Approve / Reject / Request information, audit link, technician profile link
- Fallback banner → Technicians pending filter only when API reports unimplemented

---

## Marketing data flow

```
Admin UI (create / schedule / publish)
  → Backend marketing + content-block APIs
  → MongoDB
  → Delivery APIs
  → Customer App / Technician App
```

| Surface | Source |
|---|---|
| Platform Promotions | `marketingApi.listPlatformPromotions` |
| Sponsored Campaigns / Ads | `marketingApi.listSponsored` |
| Dynamic Content | `contentBlocksApi` |
| Offer moderation | Offers API |
| Analytics | Marketing analytics API |

**Improvements this pass**

- Detail drawers: schedule, audience, media preview, campaign statistics
- Banner / block previews use `resolveMediaUrl` + `LazyImage` (no broken icons)
- No frontend business copy arrays introduced; kind/type lists remain schema enums for forms

---

## Media pipeline fixes

| Layer | Behaviour |
|---|---|
| Upload | `uploadService.registerUpload` → storage adapter (local / Cloudinary) → `Upload.url` |
| Resolve | `resolveMediaUrl` / `resolveProfileImageUrl` / `hasProfilePhoto` |
| Display | `LazyImage` (retry → fallback → empty) · `ProfileAvatar` (photo → initials) |
| Marketing | Banner URLs resolved; catalog fallbacks for missing art — never broken `<img>` |

Broken browser image icons must not appear when these components are used.

---

## Lock Management implementation

**Backend**

- `TechnicianProfile.unlockRequestedAt` / `unlockRequestNote`
- `POST /technicians/me/unlock-request`
- `POST /admin/technicians/:id/lock` (temporary lock)
- Unlock clears unlock-request fields
- Admin list select includes lock reason + unlock request fields
- Mapper maps `unlock_requested` lock status

**Frontend (`LocksPage`)**

- Overview cards: currently locked, unlock requests, permanent bans, free-job locks
- Search + filters
- Restricted account list with informative empty state
- Lock history from audit trail
- Detail drawer: Unlock / Lock / Permanent ban / View profile · jobs · payments · verification
- Export path via Audit Logs CSV

---

## Audit Logs

Replaced placeholder with live `adminApi.auditLogs` table + CSV export + action filter.

---

## New administrator guidance (module descriptions)

| Module | Description |
|---|---|
| Verification Center | Review and approve technician identity and compliance documents before they become eligible for customer bookings. |
| Marketing | Manage promotions, sponsored campaigns, advertisements and dynamic content displayed across the platform. |
| Lock Management | Temporarily or permanently restrict marketplace accounts, review unlock requests and maintain security audit history. |
| Free Job Settings | Configure complimentary job limits available to technicians before subscription plans apply. |
| Categories | Organise marketplace services and control how they appear throughout the customer and technician applications. |
| Payments & Escrow | Monitor collections, escrow balances, refunds, disputes, payouts and settlement activity. |
| Live Tracking | Monitor active technician journeys, customer routes and travel progress in real time. |
| Audit Logs | Every administrator action is recorded for compliance, security review, and marketplace governance. |

Other modules retain concise professional subtitles.

---

## Hard-coded content removed / clarified

| Item | Action |
|---|---|
| Verification “coming soon” empty state | Replaced with live queue |
| Audit “coming soon” empty state | Replaced with live audit table |
| Lock Management unlock queue “Not available yet” + hardcoded `0` | Replaced with real unlock-request data |
| Subscriptions vague empty copy | Clarified Phase-2 empty state with link to Free Job Settings |
| Marketing mock arrays | None found in production admin UI |

**Remaining intentional non-live scaffolds (documented, not fake data):** Dynamic Pricing, Subscriptions plan catalogue.

---

## Files modified

```
backend/src/services/verification/verification.service.ts   (new)
backend/src/services/index.ts
backend/src/controllers/index.ts
backend/src/routes/index.ts
backend/src/models/verification/Verification.ts
backend/src/models/technician/Technician.ts
backend/src/services/marketplace/admin.service.ts
backend/src/services/marketplace/freeJob.service.ts
packages/api/verificationApi.ts                            (new)
packages/api/admin.ts
packages/api/adminApi.ts
packages/api/mappers.ts
packages/types/admin.ts
apps/admin/pages/VerificationPage.tsx
apps/admin/pages/LocksPage.tsx
apps/admin/pages/AuditPage.tsx
apps/admin/pages/SubscriptionsPage.tsx
apps/admin/pages/FreeJobsPage.tsx
apps/admin/pages/CategoriesPage.tsx
apps/admin/pages/PaymentsEscrowPage.tsx
apps/admin/pages/TrackingPage.tsx
apps/admin/pages/marketing/MarketingLayout.tsx
apps/admin/pages/marketing/PlatformPromotionsPage.tsx
apps/admin/pages/marketing/SponsoredContentPage.tsx
apps/admin/pages/marketing/ContentBlocksPage.tsx
ADMIN_MODULE_INTEGRITY_AUDIT.md                             (this file)
```

**Components reused:** `PageHeader`, `AsyncStateView`, `Dialog`, `ProfileAvatar`, `LazyImage`, `StatusBadge`, `Surface`, `DataTable`, `adminApi`, `marketingApi`, `resolveMediaUrl`.

---

## Regression testing

| Check | Result |
|---|---|
| Verification Center loads queue from API | Pass (empty queue is valid when no submissions) |
| Redirect to Technicians only as API fallback | Pass |
| Approve / Reject / Request info paths wired | Pass |
| Marketing lists from backend only | Pass |
| Marketing item detail drawer + media preview | Pass |
| Dynamic content uses API + LazyImage preview | Pass |
| Avatar / media fallbacks (no broken icons) | Pass |
| Lock Management cards / list / unlock / lock history | Pass |
| Informative empty states | Pass |
| Module descriptions present | Pass |
| No new frontend business mock datasets | Pass |
| Mongo / existing lock & free-job flows preserved | Pass |

---

## Production readiness verdict

**Ready for staged rollout** of Verification Center, Lock Management, Audit Logs, and marketing detail/media hardening.

**Ops notes**

1. Technicians must submit documents via `POST /verification/requests` (or admin-assisted submit) for the queue to populate.
2. Unlock requests appear after `POST /technicians/me/unlock-request` while locked.
3. Ensure storage / Cloudinary URLs remain absolute HTTPS in `Upload.url` and profile `photoUrl`.
4. Subscriptions and Dynamic Pricing remain intentionally scaffolded until their APIs ship — they do not inject fake metrics.

**Verdict:** Administrator Command Center integrity for the audited modules is production-safe: placeholders removed where APIs exist, fallbacks are explicit, media fails closed to placeholders, and marketing remains end-to-end backend managed.
