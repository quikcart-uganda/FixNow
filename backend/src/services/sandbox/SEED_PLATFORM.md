# Seed Platform — Phase 2

Permanent development fixtures in Content Environment **`sandbox`**.

## Contract

1. Always `dataEnvironment: sandbox`
2. Stamp `metadata` with `generatedBy`, `generatedOn`, `seedVersion`, `seedTag`
3. Refuse production process env for CLI
4. Require Sandbox Management `enableSandbox` for generate/reset/delete

## Modules

| Path | Role |
| --- | --- |
| `seed/constants.ts` | Version, tag, developer technician credentials |
| `seed/fixtures.catalog.ts` | Customers, techs, F01–F17 workflows, offers, reviews |
| `seed/seedPlatform.generator.ts` | Idempotent upserts |
| `seed/seedPlatform.service.ts` | Admin lifecycle API |
| `scripts/seed-platform.ts` | CLI |

## Admin

- UI: `/admin/settings/seed-platform`
- API: `/api/v1/admin/seed-platform/*`
- Distinct from Sandbox Management (`/admin/settings/sandbox`)

## Developer technician

- Email: `quikcart2026@gmail.com`
- Documented password: `FixNowDev!2026` (**applies only after Seed Generate upserts this account**)
- Expected display name after seed: Jordan Mutebi
- `metadata.developer: true`, `dataEnvironment: sandbox`
- No Preview subscriptions (Phase 3)

### Credential rule

The Permanent Development Technician keeps the **original registration password**. Integrity repair and Seed Generate **do not** overwrite `passwordHash` for this email. Documented seed password `FixNowDev!2026` is a reference for fresh installs only — runtime documentation must stay consistent with the preserved credential.

### Development Transaction IDs

While Platform Mode is Development, the Permanent Development Technician activates Starter / Professional / Business using `DEV-STARTER-*` / `DEV-PRO-*` / `DEV-BUSINESS-*` IDs. Verification is automatic and still calls `activateSubscriptionForUser` (same entitlement engine). Production Mode disables this path. Other technicians cannot use Development Transaction IDs.


## CLI

```bash
cd backend
npm run seed:platform
npm run seed:platform -- --validate
npm run seed:platform -- --modules=jobs,reviews
```
