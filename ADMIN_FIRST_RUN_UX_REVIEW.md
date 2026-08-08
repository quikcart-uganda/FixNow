# Admin First-Run UX Review

**Date:** 2026-07-26  
**Scope:** Remove developer-facing implementation details from the FixNow Admin UI; keep engineer shortcuts hidden and flag-gated.  
**Roles:** Principal UX Engineer · Principal Security Architect

---

## Verdict

The first-run and login surfaces are now **operator-facing only**. Environment banners, CLI/npm instructions, seed-login panels, and development/production copy are gone from the standard UI. Passwordless engineer entry remains behind `ALLOW_DEV_ADMIN_LOGIN` on a **hidden** `/admin/dev` path (plus silent shortcuts).

---

## 1. Removed from visible UI

| Item | Previous location | Status |
|---|---|---|
| “DEVELOPMENT ENVIRONMENT” banner | Login / first-run | Removed |
| “No administrator accounts have been created yet…” | First-run copy | Replaced with operator message |
| “Run Bootstrap CLI” + `npm run …` | First-run card | Removed |
| “Development Quick Login” / seed explanations | First-run + login | Removed |
| “Development Mode” card under login | Login | Removed |
| npm bootstrap hint on Administrators page | Footer / empty state | Removed |

---

## 2. First-run experience (no administrators)

Displayed copy only:

- **Title:** Welcome to FixNow Command Centre  
- **Message:** Set up your first administrator to secure and manage your FixNow platform.  
- **Primary:** Create Administrator → `/admin/setup`  
- **Secondary:** Restore Existing Administration → `/admin/forgot-password`

No mention of bootstrap, CLI, npm, development, production, seed accounts, or environment variables.

---

## 3. Hidden developer access

Controlled by server flag `devLoginEnabled` (`ALLOW_DEV_ADMIN_LOGIN` + non-production). When false, the capability behaves as if it never existed.

| Mechanism | Behaviour |
|---|---|
| `/admin/dev` | Hidden route. If flag off → silent redirect to `/admin/login` |
| Long-press logo (~1.2s) on login / first-run | Navigates to `/admin/dev` only when flag on — **no visible hint** |
| Ctrl/Cmd+Shift+D on login / first-run | Same |

The `/admin/dev` page itself uses neutral copy (“Admin Console Entry” / “Continue”) — no seed/dev/environment language.

Backend `POST /auth/dev-admin-login` still refuses when the flag is off (unchanged production safeguard).

---

## 4. Production safeguards

| Check | Result |
|---|---|
| Production boot with `ALLOW_DEV_ADMIN_LOGIN=true` | Still refused by `env` guards |
| `devLoginEnabled` in production | Always `false` |
| `/admin/dev` in production | Redirects to login; no panel |
| Standard login / first-run | No banners, CLI, seed buttons, or env labels |
| Setup wizard | Operator language (“Administrator Recovery Key”) — no CLI/npm |

Authenticated **Development Controls** (Super Admin settings) remains an intentional ops tool for flagged environments — not part of the public first-run/login surface.

---

## 5. Files modified

| File | Change |
|---|---|
| `apps/admin/pages/LoginPage.tsx` | Clean first-run + login; silent shortcuts only |
| `apps/admin/pages/DevEntryPage.tsx` | **New** — hidden `/admin/dev` entry |
| `apps/admin/AdminRoutes.tsx` | Register `dev` route |
| `apps/admin/pages/SetupPage.tsx` | Operator-facing recovery/setup copy |
| `apps/admin/pages/AdminsPage.tsx` | Remove npm/CLI empty-state/footer |

---

## 6. Security validation

- No developer banners or implementation docs in the standard Admin UI.
- No debug/seed messaging on login or first-run.
- Engineer entry is flag-gated server-side; UI never advertises it.
- Production builds do not surface the capability (flag forced off + route redirects).

---

## 7. Manual checks

1. Fresh DB → first-run shows only Welcome / Create / Restore.  
2. After creating an administrator → standard login, no amber cards.  
3. With `ALLOW_DEV_ADMIN_LOGIN=true` → `/admin/dev` works; long-press / shortcut work.  
4. With flag false or production → `/admin/dev` → login; shortcuts do nothing useful.  
5. Grep Admin login/setup for “npm”, “bootstrap”, “DEVELOPMENT”, “seed” in user-visible strings — clear.
