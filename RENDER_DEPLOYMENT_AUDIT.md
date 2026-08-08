# FixNow Render Deployment Audit

**Date:** 2026-08-08  
**Constraint:** Audit first; no application/business/UI/DB logic changes; minimum safe infra fixes only  

---

## 1. Root cause

**Render is configured to deploy branch `master`, but GitHub no longer has a `master` branch.**

| Fact | Evidence |
|------|----------|
| Only remote branch | `git ls-remote --heads origin` → **only** `refs/heads/clean-master` |
| GitHub default branch | `origin/HEAD` → `refs/heads/clean-master` |
| GitHub UI | Default branch listed as **clean-master** only |
| Local `master` | Exists locally at `17d6687` (“Initial FixNow project”) but **is not on origin** |
| Why clicking “master” in Render opens `clean-master` | GitHub redirects renamed/default-branch URLs; the **string Render stores is still `master`**, which **does not resolve as a fetchable ref** |

That matches Render’s pre-build error:

> **failed to fetch commit or branch from GitHub**

This fails **before** build/start commands run. Build scripts are not the primary failure.

`clean-master` is a **real branch** (default + only remote branch), not a GitHub UI alias for `master`.

---

## 2. Git branch architecture

| Item | Value |
|------|--------|
| Current local branch | `clean-master` |
| Upstream | `origin/clean-master` (up to date at audit time for last push) |
| HEAD commit (local/remote) | `31724843110b5df77b57bfe0292a61b3a451141d` |
| Remote URL | `https://github.com/quikcart-uganda/FixNow.git` |
| Owner / repo | `quikcart-uganda` / `FixNow` |
| Remote branches | **`clean-master` only** |
| Local-only `master` | `17d6687` — **not** an ancestor of `clean-master` (divergent / superseded history) |
| Detached HEAD | No |
| `render.yaml` (before fix) | **Missing** |

### Working tree note

Many **unrelated** local modifications exist (env templates, messaging, seed platform, etc.). They are **not** required to fix the Render fetch error and were **not** mass-committed as part of this audit.

---

## 3. GitHub findings

| Check | Result |
|-------|--------|
| Repository exists | Yes — `https://github.com/quikcart-uganda/FixNow` |
| Branch `clean-master` exists | Yes — SHA `3172484…` |
| Branch `master` exists on GitHub | **No** |
| Default branch | **`clean-master`** |
| `gh` CLI auth in this environment | Not logged in (`gh auth login` required for API) — git remote + public GitHub pages used instead |
| Cursor GitHub Connect | Timed out — continued with git/`ls-remote` |

**Permissions:** If Render still fails after the branch is corrected to `clean-master`, reconnect the Render GitHub App / re-authorize the `FixNow` repo. Branch mismatch alone is sufficient to explain the current error.

---

## 4. Render findings

| Item | Finding |
|------|---------|
| Public service host | `https://fixnow-dpjg.onrender.com` (responds / wakes; health not fully asserted while cold-starting) |
| Configured deploy branch (per operator report) | **`master`** ← invalid on GitHub |
| Correct deploy branch | **`clean-master`** |
| Repo connection | Service is connected, but fetch target branch is wrong |
| Auto deploy | Will keep failing until branch is updated |
| Dashboard access from this agent | **No** — cannot change Render Settings from here |

### Required operator action (external)

In **Render Dashboard → FixNow web service → Settings**:

1. Set **Branch** to `clean-master` (not `master`)
2. Save
3. **Manual Deploy** → Deploy latest commit
4. Optional: disconnect/reconnect GitHub if fetch still fails after branch fix

---

## 5. Deployment findings

| Setting | Expected for API |
|---------|------------------|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` (`node dist/server.js`) |
| Node | `>=20` (`backend/package.json` engines) |
| Health check | `/health` |
| Monorepo | Frontend is repo root Vite app; API is `backend/` — Render API service must use `rootDir: backend` |

No `render.yaml` existed before this audit (now added).

### Environment (do not expose secrets)

Required for a healthy production boot (see `backend/.env.render.example`):

- `MONGODB_URI` (Atlas — not localhost)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars)
- `CORS_ORIGINS` (real SPA origins)
- `EMAIL_PROVIDER` ≠ `console` + provider credentials
- `SMS_PROVIDER` ≠ `console` + provider credentials
- Public URL vars pointing at `https://fixnow-dpjg.onrender.com`

Missing any of the above causes **runtime** failures after a successful git fetch — separate from this pre-build error.

---

## 6. Safe fixes applied

| Fix | Status |
|-----|--------|
| Identified branch mismatch `master` vs `clean-master` | Done |
| Added `render.yaml` with `branch: clean-master`, `rootDir: backend` | Done |
| Documented Render Dashboard branch change | Done (operator must apply) |
| Application / business / UI / DB code | **Not modified** |
| Force push / history rewrite / new long-lived branch | **Not done** |
| Did **not** recreate remote `master` | Intentional — would add a second deploy target and confuse defaults |

---

## 7. Validation

| Check | Result |
|-------|--------|
| Repo has fetchable default branch | **Pass** — `clean-master` @ `3172484…` |
| `master` fetchable on GitHub | **Fail** (expected) — explains Render error |
| Render branch corrected in Dashboard | **Pending operator** |
| Render can fetch after Dashboard fix | **Expected pass** once branch = `clean-master` |
| Auto/manual deploy | **Pending** until Dashboard branch update |
| Working tree fully clean | **No** — unrelated WIP remains uncommitted by design |
| Deployment config references obsolete `master` in repo | Cleared via `render.yaml` (`clean-master`) |

---

## 8. Current deployment branch (correct)

**`clean-master`**

---

## 9. Current default GitHub branch

**`clean-master`**

---

## 10. Confirmation for future commits

Once Render Settings → Branch = **`clean-master`**:

- Render will fetch `origin/clean-master`
- Auto Deploy can track new pushes to `clean-master`
- Future custom domains / URLs remain env-only (`BACKEND_PUBLIC_URL`, `VITE_*`)

Until that Dashboard change is made, **new pushes cannot fix** “failed to fetch commit or branch from GitHub.”

---

## Files modified (this audit)

| File | Purpose |
|------|---------|
| `render.yaml` | Blueprint: `clean-master` + `backend` root + build/start |
| `RENDER_DEPLOYMENT_AUDIT.md` | This report |

---

## GitHub sanity summary

```
Local branch:     clean-master → origin/clean-master
Remote HEAD:      clean-master
Remote branches:  clean-master only
Local master:     stale / local-only (17d6687) — do not deploy from it
Deploy branch:    clean-master (must match Render Settings)
```

**`clean-master` is a real renamed/default branch, not mere UI labeling.** Render must deploy that name explicitly.
