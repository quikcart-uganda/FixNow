# Development Admin Incident Investigation Report

**Date:** 2026-07-30  
**Subject email (observed):** `quikcart2026@gmail.com`  
**Constraint:** Audit-first; no password reset; no account recreation; no Production Governance redesign  

---

## 1. Executive summary

The inconsistent “Development Administrator” authentication/authorization incident is explained primarily by **identity confusion**, compounded by **session leftover** and **seed lock/regenerate timing** — not by a broken password hash on the Development Administrator.

| Identity | Email | Portal | Auth method |
| --- | --- | --- | --- |
| **Development Administrator** | `dev.admin@fixnow.demo` | Admin Command Center | Passwordless **Internal Development Access** (non-prod) |
| **Developer technician** (Seed Platform) | `quikcart2026@gmail.com` | FixNow Pro **technician** | Password `FixNowDev!2026` |

The provided screenshot shows **FixNow Pro technician login** (“Use your FixNow technician account”) with `quikcart2026@gmail.com`. That account is the permanent **sandbox developer technician**, not the Development Administrator.

**Verdict:** Root cause is **authorization/identity mismatch + intermittent technician auth state**, not missing Dev Admin credentials. Safe repairs were applied to prevent recurrence without promoting `quikcart2026@gmail.com` to admin.

---

## 2. Timeline of the observed incident

1. Tester used `quikcart2026@gmail.com` believing it was the Development Administrator.  
2. Login failed (wrong portal expectations, empty password client validation, lockout, and/or seed soft-delete window).  
3. “Access without password” failed — expected for technician password auth; Dev Admin is a **different** passwordless Admin entry.  
4. Opening Admin development modules showed **Access denied** — expected for `role=technician` (no AdminUser / no capabilities).  
5. Later, the **same password** succeeded on the technician portal — consistent with lock expiry, seed regenerate completion, or corrected autofill — **without recreating the account**.

---

## 3. Root cause analysis

### Primary — Identity confusion (Authorization / product identity)

Code defines two separate developer identities:

```12:18:backend/src/services/sandbox/seed/constants.ts
export const DEVELOPER_TECHNICIAN = {
  seedKey: 'developer-technician',
  email: 'quikcart2026@gmail.com',
  ...
  password: 'FixNowDev!2026',
```

```309:313:backend/src/constants/adminIdentity.ts
export const DEV_ADMIN = {
  email: 'dev.admin@fixnow.demo',
  fullName: 'Development Administrator',
  ...
};
```

Admin Command Center requires `role=admin` + AdminUser capabilities. The technician account never receives those. Access denied is correct RBAC behavior, not a governance regression.

### Secondary — Admin login left a non-admin session (Frontend authorization)

Admin login previously did:

```ts
login(...) 
if (user.role !== 'admin') { setError(...); return } // no logout
```

So signing into Admin with the technician password could create a **technician JWT session** inside the Admin app shell → every capability-gated module showed Access denied, even though “login succeeded” momentarily.

### Tertiary — Intermittent technician auth (Authentication state)

Plausible, evidence-backed causes for “password failed then worked”:

| Mechanism | Effect |
| --- | --- |
| Failed-login lockout (`AUTH_MAX_FAILED_LOGINS` + `lockUntil`) | Temporary lock; later same password works |
| Seed regenerate soft-delete sets `isDeleted` + `accountStatus=suspended` before upsert restores ACTIVE | Mid-window login fails; after upsert succeeds |
| Browser autofill of stale password vs seed-known `FixNowDev!2026` | Apparent intermittent credential failure |
| Seed not generated yet | User missing → invalid credentials until Generate All |

None of these require a wrong stored hash for the permanent seed password after a successful upsert.

### Ruled out (for this email as Dev Admin)

- Missing Dev Admin governance metadata on `quikcart2026` — account is not Dev Admin by design.  
- Duplicate admin+technician rows for same email — `User.email` is unique.  
- Production Mode lockout of Dev Admin — screenshot is technician portal; separate prior fix covers Dev Admin vs Platform Mode.  
- JWT claim corruption for Dev Admin — not the account under test.

---

## 4. Authentication findings

| Check | Finding |
| --- | --- |
| Password verification | Technician uses bcrypt `passwordHash`; seed upsert restores known password |
| Session creation | Standard `issueTokenPair`; Remember Me TTL persistence already fixed in Phase 5 |
| Empty password | Client blocks; backend would reject |
| Dev Admin path | `/auth/dev-admin-login` + `ensureDevAdmin()` — different email |
| Google | Disabled in this environment (matches screenshot caption) |

---

## 5. Authorization findings

| Check | Finding |
| --- | --- |
| Technician → Admin modules | Deny (no AdminUser / capabilities) — correct |
| Dev Admin → development modules while Platform Mode Development | Should allow (see prior Dev Admin access fix) |
| Admin login with marketplace user | Must not retain session — **bug fixed** |

---

## 6. Governance findings

| Item | Finding |
| --- | --- |
| `governanceClassification` | Applies to AdminUser, not marketplace technicians |
| Production Super Admin | Unrelated to `quikcart2026` |
| Platform Mode | Hides admin developer UX in Production; does not redefine technician seed identity |
| Bootstrap | Seeds `dev.admin@fixnow.demo`, not Gmail technician |

---

## 7. Migration findings

**No migration of `quikcart2026@gmail.com` → Development Administrator** was performed (would destroy the Seed Platform developer technician contract and blur security boundaries).

**Safe, idempotent integrity repair** added for the developer technician:

- Preserve user id and password hash  
- Ensure `role=technician`, `dataEnvironment=sandbox`, seed metadata, `metadata.developer=true`  
- Clear lockout / soft-delete residue  
- Refuse if email is somehow an admin (conflict report only)  
- Runs from Seed Platform overview / validate  

Seed upserts also clear `failedLoginAttempts` / `lockUntil` when regenerating fixtures.

---

## 8. Files modified

| File | Purpose |
| --- | --- |
| `backend/src/services/sandbox/seed/seedPlatform.service.ts` | `ensureDeveloperTechnicianIntegrity()`; overview/validate identity notes |
| `backend/src/services/sandbox/seed/seedPlatform.generator.ts` | Clear lockout fields on seed upsert |
| `apps/admin/pages/LoginPage.tsx` | Logout on non-admin login; clear message when technician email used on Admin |

---

## 9. Validation

| Check | Status |
| --- | --- |
| Screenshot portal = technician, not Admin Dev Access | Confirmed |
| `quikcart2026` = DEVELOPER_TECHNICIAN | Confirmed in seed constants |
| `dev.admin@fixnow.demo` = DEV_ADMIN | Confirmed |
| Admin login with technician email no longer keeps bad session | Fixed |
| Integrity repair does not reset password / recreate user | By design |
| Production Super Admin / Platform Mode architecture unchanged | Yes |
| Fresh bootstrap still creates Dev Admin via passwordless path | Unchanged |

**Correct usage going forward**

1. **Admin development tooling:** Admin login → **Internal Development Access** (`dev.admin@fixnow.demo`).  
2. **Marketplace QA as developer tech:** `/technician/login` → `quikcart2026@gmail.com` / `FixNowDev!2026` after Seed Generate.  
3. **Real Super Admin / PSA:** business email via bootstrap / Production Owner wizard.

---

## 10. Preventive recommendations

1. Keep Seed Platform UI copy explicit: “Developer technician ≠ Development Administrator”.  
2. Never reuse a personal Gmail as both marketplace seed and admin identity.  
3. Prefer passwordless Dev Admin entry; avoid documenting Gmail as Admin.  
4. After any Seed Regenerate, wait for completion before testing technician login.  
5. If Access denied appears in Admin shell, check `user.role` and `/auth/me` capabilities before assuming governance failure.

---

## Completion statement

The incident is fully explained: the tested account is the **Seed Platform developer technician**, exercised on the **technician** portal. Intermittent password behavior is explained by lockout/regenerate/autofill; Access denied is explained by correct RBAC plus a leftover non-admin Admin-app session. Safe repairs prevent recurrence without converting that email into a Development Administrator or weakening Production Governance.
