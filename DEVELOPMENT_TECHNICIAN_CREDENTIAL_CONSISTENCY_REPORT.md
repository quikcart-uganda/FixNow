# Development Technician Credential Consistency Report

**Date:** 2026-08-02  
**Subject:** `quikcart2026@gmail.com`  
**Constraint:** No password change, no password reset, no account recreation, no global lockout weakening. Database edits limited to clearing temporary auth lock after audit.

---

## Executive verdict

Documentation and seed **constants** claim Development password `FixNowDev!2026`.  
Runtime MongoDB for this email still holds a **pre-seed registration** password hash that matches **neither** `FixNowDev!2026` nor `SeedPlatform!2026`.

The temporary lock was caused by repeated failed logins with the documented password. The lock has been cleared. The password hash was **not** changed.

**Recommended architecture (Option B via Seed Generate, not a silent hash rewrite):** keep the intended Seed Platform credential `FixNowDev!2026`, but apply it only through the existing technicians upsert when the operator runs Seed Platform Generate. Until then, the original registration password remains the only working credential.

Referenced reports `DEVELOPMENT_TECHNICIAN_MIGRATION_AUDIT.md` and `DEVELOPMENT_TRANSACTION_ID_IMPLEMENTATION_REPORT.md` were **not found** in the repository.

---

## 1. Runtime credential state

| Field | Runtime value (audit) |
| --- | --- |
| Email | `quikcart2026@gmail.com` |
| User id | `6a651b9940b397f5b9825d44` |
| fullName | **Ron** (not Jordan Mutebi) |
| role | `technician` |
| dataEnvironment | **`production`** (not `sandbox`) |
| metadata | **`null`** (no `seedTag` / `seedKey` / `developer`) |
| passwordHash | bcrypt `$2b$12$…` present |
| passwordChangedAt | `null` |
| createdAt | `2026-07-25T20:24:57.884Z` |
| Documented password `FixNowDev!2026` matches hash? | **No** |
| Shared seed password `SeedPlatform!2026` matches hash? | **No** |
| Auth lock (before clear) | `accountStatus=locked`, `failedLoginAttempts=5`, `lockUntil` expired |
| Auth lock (after clear) | `accountStatus=active`, `failedLoginAttempts=0`, `lockUntil=null` |
| Technician profile free-job lock | `accountLocked=false` (unrelated) |

**Conclusion:** This row is a pre-existing technician registration that occupies the Seed Platform developer email. Seed Generate technicians upsert has **never** successfully rewritten this account (name/env/metadata/password all prove that).

---

## 2. Documented credential state

| Source | Claimed password / identity |
| --- | --- |
| `backend/src/services/sandbox/seed/constants.ts` | `FixNowDev!2026`, name Jordan Mutebi, seedKey `developer-technician` |
| `backend/src/services/sandbox/SEED_PLATFORM.md` | Same (now clarified: applies after Generate) |
| `PHASE_2_DEVELOPER_TESTING_PLATFORM_REPORT.md` | Same |
| `DEVELOPMENT_ADMIN_INCIDENT_INVESTIGATION_REPORT.md` | Same; also states integrity repair **preserves password hash** |
| Seed overview API (before fix) | Always returned `passwordHint: FixNowDev!2026` even when not seed-aligned |

Shared non-developer seed password `SeedPlatform!2026` is documented for other seed users only — not this developer technician.

---

## 3. Differences

| Aspect | Documented / seed intent | Runtime |
| --- | --- | --- |
| Password | `FixNowDev!2026` | Unknown original registration hash (not either documented seed password) |
| Display name | Jordan Mutebi | Ron |
| Content env | sandbox | production |
| Seed metadata | seedTag / seedKey / developer | none |
| How password is applied | `upsertTechnician` sets `passwordHash` on Generate | Never applied |
| Integrity repair | Explicitly **preserves** password | Would not fix this mismatch even if run |

---

## 4. Root cause

1. **Email collision with a pre-seed account.** `quikcart2026@gmail.com` was created on 2026-07-25 as technician “Ron” in `dataEnvironment=production` with a registration password.
2. **Seed constants / reports were updated (or authored) to document `FixNowDev!2026`**, and the generator *would* write that hash on technicians Generate.
3. **Generate was never applied to this runtime row** (or never succeeded for technicians). Evidence: name, env, metadata, and bcrypt verify of documented passwords all fail.
4. **`ensureDeveloperTechnicianIntegrity()` intentionally never migrates passwords** — by design it only repairs role/lock/metadata flags and states “password and id preserved”.
5. Operators (and prior reports) assumed docs == runtime. Attempts with `FixNowDev!2026` failed → `AUTH_MAX_FAILED_LOGINS=5` → temporary lock → UI: “This account is temporarily locked.”
6. The **original registration password** continued to authenticate when the lock window allowed / after expiry, confirming the runtime hash never changed.

This is a **documentation / seed-application gap**, not a bcrypt bug and not a Production auth regression.

---

## 5. Option A vs Option B

| | Option A — keep original permanently | Option B — migrate to documented Development password |
| --- | --- | --- |
| Pros | No surprise for whoever knows “Ron’s” password | Matches Seed Platform architecture and all Phase 2 docs |
| Cons | Cannot publish the original password (not in repo); permanent docs drift; Seed Platform contract remains broken for this email | Changes the working password; must preserve id/history via upsert, not recreate |
| Safer path | Interim honesty only | **Intended architecture** when applied through Seed Generate |

**Recommendation: Option B, applied only through Seed Platform Generate (technicians module / Generate All).**  
Do **not** silently overwrite the hash in an ad-hoc script. The generator already:

- upserts by email (same `_id`)
- sets `passwordHash` to hash(`FixNowDev!2026`)
- stamps sandbox + developer metadata
- clears failed logins / lock on upsert
- preserves related marketplace data owned by the same user id

Until the operator runs Generate, runtime must keep using the original registration password.

---

## 6. Files modified

| File | Change |
| --- | --- |
| `backend/scripts/audit-dev-technician-credentials.mjs` | Read-only audit (+ optional verify / clear-temp-lock) |
| *(runtime DB)* | Cleared temp lock only for this user (`failedLoginAttempts`, `lockUntil`, `accountStatus→active`) — **password hash unchanged** |
| `backend/src/services/sandbox/seed/seedPlatform.service.ts` | Overview reports `seedAligned`, honest password hint / credential note |
| `packages/api/seedPlatformApi.ts` | Types for alignment / credential note |
| `apps/admin/pages/SeedPlatformPage.tsx` | UI shows not-seed-aligned state honestly |
| `backend/src/services/sandbox/SEED_PLATFORM.md` | Credential rule clarified |
| `PHASE_2_DEVELOPER_TESTING_PLATFORM_REPORT.md` | Password applies after Seed Generate |

No global lockout policy change. No Production auth path change.

---

## 7. Validation

| Check | Result |
| --- | --- |
| Runtime hash ≠ `FixNowDev!2026` | ✓ Confirmed via bcrypt compare |
| Runtime hash ≠ `SeedPlatform!2026` | ✓ Confirmed |
| Docs previously overstated runtime password | ✓ Confirmed; corrected in Seed overview + SEED_PLATFORM.md |
| Temp lock from failed documented-password attempts | ✓ `failedLoginAttempts=5`, `accountStatus=locked` |
| Temp lock cleared without password change | ✓ Re-audit: `active`, attempts `0`, same bcrypt prefix |
| Development Technician can use **original** password again | ✓ Expected after lock clear (operator-known credential) |
| Documented password works only after Seed Generate | ✓ By design; not applied in this pass |
| Production auth / lockout thresholds unchanged | ✓ |

### Operator next step (Option B)

1. Enable Sandbox Management.  
2. Admin → Seed Platform → Generate (at least `technicians`, or Generate All).  
3. Login with `quikcart2026@gmail.com` / `FixNowDev!2026`.  
4. Confirm Seed overview shows **Ready** / `seedAligned: true` and name Jordan Mutebi.

Until then: use the original registration password; do not expect `FixNowDev!2026` to work.

---

## Appendix — audit commands

```bash
cd backend
node scripts/audit-dev-technician-credentials.mjs
node scripts/audit-dev-technician-credentials.mjs --verify-documented
# already executed after audit:
# node scripts/audit-dev-technician-credentials.mjs --clear-temp-lock
```
