# Vite Startup Failure Report

**Date:** 29 July 2026  
**Symptom:** `[fixnow:dev] Vite exited unexpectedly (exit code 1)` with a stack ending at `httpServerStart` → `startServer` → `Object.listen` → `CAC.<anonymous>`  
**Status:** Root cause identified and permanently fixed. Dev launcher starts / reuses successfully; Customer / Technician / Admin portals respond.

---

## 1. Root cause

### Primary (exact cause of exit code 1)

**Port 5173 was already bound by an existing Vite process.** Child Vite then failed with:

```text
Error: Port 5173 is already in use
```

That error is printed **above** the `httpServerStart` / `listen` frames. Those frames are only the failure path for binding the HTTP server — not the underlying reason.

Why the launcher thought the port was free:

1. Vite is configured with `server.host: true` and `strictPort: true` (`vite.config.ts`).
2. On Windows that typically listens on **IPv6 `::`** (often dual-stack) and/or `0.0.0.0`.
3. `scripts/dev-frontend.mjs` previously probed bindability on **`0.0.0.0` only**.
4. Binding `0.0.0.0:5173` can succeed while `:::5173` is already taken → false “port free”.
5. Second Vite spawn → `EADDRINUSE` → child exit `1` → launcher: `Vite exited unexpectedly (exit code 1)`.

Evidence at diagnosis:

| Check | Result |
|---|---|
| Existing listener | `node …/vite/bin/vite.js --host --port 5173 --strictPort` |
| HTTP on existing process | `200` |
| IPv4-only bind probe | Could report free |
| IPv6 `::` bind probe | `EADDRINUSE` |
| Second Vite start | Exit 1 at `httpServerStart` |

**Category:** Port / dual-stack bind race (configuration + launcher), not a bad plugin, missing dependency, syntax error, or corrupted `node_modules`.

### Secondary (amplified “zombie listener” / false hung kills)

Two related issues made cold starts look dead even when Vite had printed `ready`:

1. **Tailwind v4 default source crawl** — `@import "tailwindcss"` without `source(none)` scans every non-gitignored file. This repo’s `.gitignore` does **not** ignore `android/` or `backend/` (~10k+ files). First transforms (e.g. `/src/main.tsx`) took **~35s** and HTML routes timed out while the port stayed `LISTENING`.
2. **Launcher HTTP probes aborted at 4s** — shorter than first-transform time. Aborting in-flight work left the process listening but not completing responses; the launcher could then kill Vite after the ready timeout even though the failure mode was “slow / interrupted”, not “dead”.

These did **not** produce the original `EADDRINUSE` stack by themselves, but they produced the same user-visible pain (port up, HTTP dead / launcher exits).

---

## 2. Files affected

| File | Role |
|---|---|
| `scripts/dev-frontend.mjs` | Dual-stack port check; reuse healthy Vite; longer sequential HTTP probes; clearer `EADDRINUSE` messaging |
| `src/index.css` | `@import "tailwindcss" source(none)` + explicit `@source` for `apps/`, `packages/`, `src/`, `index.html` |
| `vite.config.ts` | Audited — `host: true`, `strictPort: true`, `holdUntilCrawlEnd: false`, aliases/plugins OK (no change required for primary cause) |

Not root-cause for this incident: package downgrades, cache wipes, or disabling HMR / portals.

---

## 3. Why Vite crashed

```text
npm run dev
  → scripts/dev-frontend.mjs
    → (old) IPv4-only “port free?” → YES (wrong on Windows dual-stack)
    → spawn vite --host --port 5173 --strictPort
      → listen() → EADDRINUSE
      → exit 1
    → “[fixnow:dev] Vite exited unexpectedly (exit code 1)”
```

The stack at `httpServerStart` is the bind failure after the real error line `Port 5173 is already in use`.

---

## 4. Changes made

### `scripts/dev-frontend.mjs`

- Bind-check **both** `0.0.0.0` and `::` before spawning.
- If HTTP already returns success on `127.0.0.1:5173`, **reuse** that process (print portal banner) instead of spawning a second Vite.
- If the port is bound but the short probe timed out, **retry HTTP** with a longer budget before labeling the listener “stale”.
- Probe with `node:http`, **one request at a time**, default **45s** per probe / **180s** overall ready window (overridable via `FIXNOW_DEV_PROBE_MS` / `FIXNOW_DEV_READY_TIMEOUT_MS`).
- Surface `EADDRINUSE` explicitly when a child still dies on bind.

### `src/index.css`

```css
@import "tailwindcss" source(none);

@source "../apps";
@source "../packages";
@source ".";
@source "../index.html";
```

Prevents Tailwind from scanning `android/` and `backend/`. Observed `/src/main.tsx` warm transform drop from ~35s to ~7ms after the change.

---

## 5. Validation performed

| Check | Result |
|---|---|
| First error in logs | `Port 5173 is already in use` / dual-stack bind race |
| Vite config plugins / aliases / server | Valid |
| Env (`.env`, `.env.local`) | Present; not the crash cause |
| Merge conflict markers | None found in scanned sources |
| Cold `node scripts/dev-frontend.mjs` | Banner: reachable; `Validated HTTP 200` |
| Second launcher while Vite running | Reuses: `Port 5173 already serving (HTTP 200)` — **no exit 1** |
| `/`, `/customer`, `/technician`, `/admin` | HTTP `200` |
| Warm `/` after settle | ~100ms |
| `npm run build` (`tsc -b && vite build`) | **Fails on pre-existing TS / export issues unrelated to this startup fix** (see risks) |
| `npx vite build` | Fails on missing barrel exports (`authActionPrimaryClass` etc.) already present in source — separate production packaging issue |

---

## 6. Remaining risks

1. **Production `npm run build` is already red** for reasons outside this startup incident:
   - TS: `Badge` `children` vs `label` on admin Location/Sandbox pages; unused locals elsewhere.
   - Rollup/Rolldown: `MISSING_EXPORT` for auth UX classes from `@fixnow/shared` despite re-exports in `packages/shared/index.ts` — needs a dedicated packaging/export investigation.
2. **Cold first HTML after dep re-optimize** can still take several seconds while the optimizer runs; the launcher now waits long enough instead of aborting at 4s.
3. **`npm run dev:vite` (raw Vite)** still exits with `EADDRINUSE` if 5173 is taken — expected with `strictPort: true`. Use `npm run dev` (launcher) as the supported path.
4. LAN clients (Android on `172.x`) can add concurrent transform load during local probing; prefer a single cold open after ready.

---

## 7. How to run going forward

```bash
npm run dev
```

If a true stale listener exists (port bound, HTTP never succeeds even after ~45s):

1. Identify the Node/Vite owner of port **5173** only.
2. Stop that development process.
3. Re-run `npm run dev`.

Do not clear `node_modules/.vite` unless dep metadata is confirmed corrupt; warm cache is desirable after the Tailwind source fix.
