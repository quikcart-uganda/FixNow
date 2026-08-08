# SEED CUSTOMER RUNTIME — IMPLEMENTATION REPORT

**Date:** 2026-08-08  
**Scope:** Convert existing customer `kingjordannyago@gmail.com` into Permanent Seed Customer; Seed Platform control surface for customers + scenarios; production job pipeline for E2E seed testing.

---

## 1. Audit summary (pre-implementation)

| Area | Finding |
|------|---------|
| Permanent Seed Technician | Mature (`quikcart2026@gmail.com`) with integrity, lifecycle, Dev TX, simulator |
| Permanent Seed Customer | **Missing** before this work — no `DEVELOPER_CUSTOMER` governance path |
| Catalogue customers | Six `@fixnow.seed` fixtures — not permanent governance accounts |
| Job seeding | Often direct upserts; not always via `jobMarketplaceService.create` |
| Soft-delete | Risk of wiping permanent identities if not excluded |

**Constraints honored:** no duplicate customer; no password overwrite; no customer/auth/payment architecture redesign; same production job pipeline for scenarios; sandbox isolation via `dataEnvironment=sandbox`.

---

## 2. Architecture

```
Existing User (kingjordannyago@gmail.com)
        │
        ▼ ensureDeveloperCustomerIntegrity()
Permanent Seed Customer (sandbox metadata, password preserved)
        │
        ▼ seedScenarioService.generate()
jobMarketplaceService.create (production path)
        │
        ▼ stamp job dataEnvironment=sandbox + seed metadata
Matching → applications → chat → completion → review (real services)
```

**Control centre:** Seed Platform (Super Admin) — provision, customer lifecycle, scenario generate.

**Sandbox payments:** Development Transaction IDs remain **technician-only** and are **disabled in Platform Mode Production**. Scenario jobs use the normal marketplace create path and are stamped sandbox; they do not invent a parallel payment engine.

---

## 3. Migration rules

1. Look up existing user by email only — never create a second account.
2. Never write `passwordHash` (policy: `preserved_from_registration`).
3. Set `dataEnvironment=sandbox` + seed metadata (`permanentDevelopmentCustomer`, `scenarioPermissions`, etc.).
4. Ensure `CustomerProfile` exists / is synced; soft-delete/reset exclude permanent customer + technician.
5. Conflict if email is admin / Dev Admin.

---

## 4. Files touched

| File | Change |
|------|--------|
| `backend/src/services/sandbox/seed/constants.ts` | `DEVELOPER_CUSTOMER` (no password) |
| `backend/src/services/sandbox/seed/seedCustomer.integrity.ts` | In-place migrate + integrity |
| `backend/src/services/sandbox/seed/seedScenario.service.ts` | Scenario catalogue + production create |
| `backend/src/services/sandbox/seed/seedPlatform.generator.ts` | Password preserve; soft-delete exclusions |
| `backend/src/services/sandbox/seed/seedPlatform.service.ts` | Provision customer, overview, list/lifecycle, scenarios |
| `backend/src/controllers/index.ts` | New Seed Platform endpoints |
| `backend/src/routes/index.ts` | Routes for customer + scenarios |
| `packages/api/seedPlatformApi.ts` | Client API + overview types |
| `apps/admin/pages/SeedPlatformPage.tsx` | Customer card, provision, customers + scenarios panels |
| `backend/scripts/provision-permanent-development-customer.ts` | CLI provision + password hash verify |

---

## 5. API surface (Super Admin)

| Method | Path |
|--------|------|
| POST | `/admin/seed-platform/provision-permanent-development-customer` |
| GET | `/admin/seed-platform/customers` |
| POST | `/admin/seed-platform/customers/lifecycle` (`suspend` \| `activate`) |
| GET | `/admin/seed-platform/scenarios` |
| POST | `/admin/seed-platform/scenarios/generate` (`scenarioIds` or `all: true`) |

Overview now includes `developerCustomer`, `customerIntegrity`, and `sandboxPayments` notes.

---

## 6. Validation checklist

- [ ] Sign in once as `kingjordannyago@gmail.com` if the account is not yet in Mongo.
- [ ] Run Seed Platform → **Provision Permanent Seed Customer**, or  
      `npx tsx scripts/provision-permanent-development-customer.ts`
- [ ] Confirm `passwordPreserved: true` and `duplicateCount: 1`.
- [ ] Confirm overview shows Seed Customer **Ready** / seed-aligned.
- [ ] Generate one or more scenarios; jobs appear with `dataEnvironment=sandbox` and seed metadata.
- [ ] Apply as Permanent Development Technician; exercise matching/chat/completion as normal.
- [ ] Confirm Dev TX / sandbox tooling remain blocked in Platform Mode Production.
- [ ] Delete/reset seeds still **retains** permanent technician + permanent customer.

---

## 7. Password & secrets

- Registration password is **never** stored in source, constants, or this report.
- Seed Platform UI shows only “original registration password (preserved)”.
- Documented seed password for catalogue users (`SEED_USER_PASSWORD`) does **not** apply to the Permanent Seed Customer.

---

## 8. Safety unchanged

No redesign of entitlements, auth, navigation, or production payment engines. Development Transaction verification stays gated to Development Mode + Permanent Development Technician only.
