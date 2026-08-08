# Capacitor Android Recovery Report

**Date:** 2026-07-26  
**Mode:** Investigation only — **no terminal commands executed** (awaiting user approval)

---

## 1. Repository structure (audited)

```
D:\FixNow\FIXNOW APP\FIXNOW APP\     ← npm package root + Capacitor root (Cursor workspace)
├── package.json                     ← name: "fixnow-app" (Vite + Capacitor)
├── package-lock.json
├── capacitor.config.ts              ← appId: com.fixnow.app, webDir: dist
├── android\                         ← FULL native Android project (already present)
├── ios\                             ← FULL native iOS project (already present)
├── apps\                            ← customer / technician / admin web portals
├── packages\                        ← shared UI / API / native helpers
├── backend\                         ← SEPARATE npm package (fixnow-backend)
│   └── package.json
├── public\
└── .vscode\
```

### What this is / is not

| Question | Answer |
|----------|--------|
| Standard Capacitor project? | **Yes** — `capacitor.config.ts` + `android/` + `ios/` at package root |
| NX workspace? | **No** — no `nx.json` |
| Monorepo? | **Lightweight monorepo** — root app + `backend/` separate package; not npm workspaces / not NX |
| package.json location | `D:\FixNow\FIXNOW APP\FIXNOW APP\package.json` |
| capacitor.config | `capacitor.config.ts` (root) |
| android | `android\` exists with Gradle, MainActivity, Capacitor plugins |
| ios | `ios\` exists |
| Detached Android? | **No** — `capacitor.settings.gradle` wires `@capacitor/android` + plugins from `../node_modules` |
| Parent `D:\FixNow\FIXNOW APP\package.json` | **Does not exist** |
| `D:\FixNow\package.json` | **Does not exist** |

---

## 2. Capacitor health (from files)

Declared in root `package.json`:

| Package | Declared version |
|---------|------------------|
| `@capacitor/core` | `^8.4.2` |
| `@capacitor/android` | `^8.4.2` |
| `@capacitor/ios` | `^8.4.2` |
| `@capacitor/cli` (dev) | `^8.4.2` |

Scripts already present: `cap:sync`, `cap:open:android`, `mobile:android`, etc.

Android project evidence:

- `android/settings.gradle` includes `:app` + Capacitor plugins  
- `android/capacitor.settings.gradle` points at `../node_modules/@capacitor/android`  
- `MainActivity` extends `BridgeActivity`  
- Embedded `android/app/src/main/assets/capacitor.config.json` matches app id  

**Conclusion:** Android has **already been added**. Recreating with `npx cap add android` would be wrong and risky.

`node_modules` is gitignored; this audit could not visually confirm install state without a shell listing. That must be verified with an approved command.

---

## 3. Root cause

### Primary (highest likelihood)

**Capacitor CLI is being run from the wrong working directory.**

The nested path `D:\FixNow\FIXNOW APP\FIXNOW APP` makes it easy to open a terminal one level too high (`D:\FixNow\FIXNOW APP`) or inside `android\` / `backend\`.

| Error message | Meaning when cwd is wrong |
|---------------|---------------------------|
| `The Capacitor CLI needs to run at the root of an npm package...` | No `package.json` in current directory (classic wrong-cwd) |
| `android platform has not been added yet` | CLI never found this project's `capacitor.config` + sibling `android/` folder |

### Secondary (to verify next)

| Cause | Likelihood | Notes |
|-------|------------|-------|
| `node_modules` missing / incomplete | Medium | Would break sync after cwd is fixed |
| Running from `backend/` | Medium | Backend has its own package.json but no Capacitor |
| Running from `android/` | Medium | Gradle root ≠ Capacitor npm root |

### Ruled out (from files)

- Android folder missing  
- Capacitor packages omitted from package.json  
- NX misconfiguration  
- Detached custom Android with no Capacitor wiring  

---

## 4. Likelihood / risk / recommended fix

| Item | Detail |
|------|--------|
| **Likelihood** | **Very high** that wrong cwd alone explains both errors |
| **Risk of fix** | **None–Low** if we only `cd` to the correct root and run `npx cap doctor` / `npx cap sync` |
| **Recommended fix** | Always run Capacitor from `D:\FixNow\FIXNOW APP\FIXNOW APP` (or rename later). Do **not** run `cap add android`. |
| **Expected outcome** | `cap doctor` lists Android; `cap sync android` succeeds; `cap open android` opens Studio |

---

## 5. Commands required (not executed)

Approval required before each:

1. Confirm cwd + package.json presence  
2. Confirm `android` folder visible from that cwd  
3. Confirm `@capacitor/*` installed under `node_modules`  
4. `npx cap doctor`  
5. Only if doctor is healthy: `npx cap sync android`  
6. Only if sync succeeds: `npx cap open android`  

---

## 6. Folder rename assessment (Phase 7) — not performed

### Current path

`D:\FixNow\FIXNOW APP\FIXNOW APP`

### Proposed path (user preference)

`D:\FixNow\FixNow Mobile App`

### Important caveat

This root is **not mobile-only**. It also hosts Customer/Technician/Admin web apps, shared packages, and `backend/`. Renaming the folder to “FixNow Mobile App” is fine for filesystem clarity, but the product is a **full-stack shell**, not a mobile-only package.

Alternative clearer layout (future, larger change):

```
D:\FixNow\
  FixNow App\          ← current root (web + Capacitor)
  ...
```

### Absolute-path / reference audit (rename impact)

| Area | Hardcodes current folder name? |
|------|--------------------------------|
| `package.json` scripts | No absolute paths |
| `capacitor.config.ts` | Relative `webDir: 'dist'` only |
| Gradle (`capacitor.settings.gradle`) | Relative `../node_modules/...` |
| `.vscode/settings.json` | Relative paths only |
| `launch.json` / `tasks.json` | **Absent** |
| `*.code-workspace` | **Absent** |
| CI workflows (`.github/workflows`) | **Absent** |
| Docs / markdown | May mention paths narratively; low risk |
| Git | Repo root = this folder; rename of parent path is OK if done outside git rewrite |

**Rename risk:** Medium (OS + Android Studio + Cursor workspace reopen). Content risk Low if only the directory name changes and relative paths stay intact.

### Explicit approval question (rename)

> Do you approve renaming the project folder to **`FixNow Mobile App`**?

**Not requested yet for execution — answer separately from Capacitor command approvals.**

---

## 7. Commands executed (approved only)

| # | Command | Result |
|---|---------|--------|
| 1 | Path `Test-Path` checks | Revealed shell was in `backend/` |
| 2 | `cd` to Capacitor root + path checks | Root OK; android/ios/packages present |
| 3 | File-based cwd check | All `True` including `@capacitor/cli` + `@capacitor/android` |
| 4 | `npx cap doctor` | **Android looking great**; iOS Xcode missing (Windows) |
| 5 | `npx cap sync android` | **Success** — copied `dist` → Android assets; 16 plugins; finished ~9s |
| 6 | `npx cap open android` | Opened Android project (`Opening Android project at: android.`) |

## 8. Changes made

- Capacitor sync updated generated Android bridge/assets only (`android/app/src/main/assets`, plugin gradle wiring).
- Temp diagnostic files created during recovery were **removed** after approval (`.capacitor-cwd-check.txt`, `.capacitor-doctor.txt`, `.capacitor-sync-android.txt`, `.capacitor-open-android.txt`).
- **No** `cap add android`. **No** project recreation. Signing / Studio settings untouched.

## 9. Validation results

| Check | Status |
|-------|--------|
| Correct npm/Capacitor root | ✓ |
| Android platform recognized | ✓ (`cap doctor`) |
| Sync successful | ✓ (`cap sync android`) |
| Android Studio open | ✓ (`cap open android` reported opening `android.`) |
| Files lost / config damaged | None observed |

## 10. Production readiness verdict

**Android Capacitor CLI is operational** when commands run from:

`D:\FixNow\FIXNOW APP\FIXNOW APP`

**Do not** run Capacitor from `backend/` or the parent `FIXNOW APP` folder.

Folder rename to `FixNow Mobile App` remains a **separate** pending approval (not performed).
