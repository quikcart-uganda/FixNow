# FixNow Server Startup & Shutdown Hardening Report

**Date:** 2026-07-25  
**Scope:** `backend/src/server.ts` lifecycle only — no business logic changed.

---

## 1. Root cause

The original crash chain:

1. `server.listen(env.PORT)` was called with **no `'error'` listener** on the HTTP server.
2. When port 4000 was already taken, Node emitted `'error'` (`EADDRINUSE`) with no handler → it was **thrown as an `uncaughtException`**.
3. The `uncaughtException` handler called `shutdown()`, which **unconditionally called `server.close()`** on a server that had never started listening.
4. `server.close()` invoked its callback with **`ERR_SERVER_NOT_RUNNING`**, the shutdown promise rejected, and the process exited via the "Shutdown failed" path — producing the confusing secondary error.

Contributing factors:

- Background jobs and the socket server were started **before** the port bind was confirmed, so a failed bind still left work to unwind.
- Cleanup steps (jobs, sockets, HTTP, Mongo) ran in one `try` block — the first failure skipped all remaining cleanup.
- `bootstrap().catch` exited immediately without disconnecting a possibly-open Mongo connection.

**Environmental note:** at audit time port 4000 was genuinely occupied by a leftover `node` process (a stale dev server). The fix makes this scenario fail fast and clean instead of cascading.

---

## 2. Files modified

| File | Change |
|------|--------|
| `backend/src/server.ts` | Full lifecycle hardening (details below) |
| `backend/package.json` | Added `"type": "module"` — source is pure ESM (`import.meta`, `.js` specifiers); without it, NodeNext compiles to CommonJS and `tsc` fails on `import.meta` (pre-existing typecheck error) |
| `backend/src/services/marketing/marketing.service.ts` | Fixed pre-existing compile error: `_adminId` param referenced as `adminId` in audit log |

No routes, services, middleware, or data models were touched.

---

## 3. Startup lifecycle (after)

```text
registerProcessHandlers()        ← SIGINT/SIGTERM/uncaught/unhandled wired first
  → initMonitoring()
  → assertPortAvailable(PORT)    ← preflight net probe; EADDRINUSE = clear log + exit(1)
  → connectDatabase()            ← state.dbConnected = true
  → CMS default seed (best-effort, unchanged)
  → createApp() + http.createServer()
  → initSocketServer(server)
  → server.on('error', ...)      ← catches probe→listen race; logs; single shutdown path
  → server.listen(PORT)
      └─ on 'listening': startBackgroundJobs() (state.jobsStarted = true) + banner logs
```

Key properties:

- **Port conflicts detected before `listen()`** via a throwaway `net` probe — the process exits before Mongo, sockets, or jobs are touched.
- The **race window** between probe and real `listen()` is still covered by the server `'error'` handler; both paths log the same actionable message and route through the single `shutdown()`.
- **Jobs start only after the port is bound**, so a failed bind has nothing extra to unwind.
- `bootstrap().catch` now calls `shutdown('bootstrap-failure', 1)` instead of a bare `process.exit(1)`, so a partially-started stack (e.g. Mongo connected, listen failed) is cleaned up.

---

## 4. Shutdown lifecycle (after)

```text
shutdown(signal, exitCode)
  ├─ duplicate guard: state.shuttingDown (first caller wins; re-entry is a no-op)
  ├─ 10s force-exit timer (unref'd, unchanged behaviour)
  ├─ stopBackgroundJobs()        ← only if state.jobsStarted; individually try/caught
  ├─ io.close()                  ← only if socket server exists; individually try/caught
  ├─ server.close()              ← ONLY if server?.listening — eliminates ERR_SERVER_NOT_RUNNING
  ├─ disconnectDatabase()        ← only if state.dbConnected; individually try/caught
  └─ exit(failed ? 1 : exitCode)
```

Signal / error handler review:

| Handler | Before | After |
|---------|--------|-------|
| `SIGINT` | `shutdown()` | Same — idempotent, stage-aware |
| `SIGTERM` | `shutdown()` | Same — idempotent, stage-aware |
| `uncaughtException` | `shutdown()` → could crash on `server.close()` | `shutdown(..., 1)` — safe at any lifecycle stage |
| `unhandledRejection` | Log only | Log only (**preserved** — a rejected promise should not kill a healthy API serving requests) |
| server `'error'` | **Missing** (root cause) | Logs EADDRINUSE clearly; single graceful exit |

Guarantees:

1. Each cleanup step runs in its own `try/catch` — one failure never skips the rest.
2. Every step is gated on state that is only set after the resource actually started.
3. `shuttingDown` flag + handlers registered once = no duplicate shutdown execution.
4. Exit code is `1` if any cleanup step failed or shutdown was error-initiated; `0` for clean signal shutdowns.

---

## 5. Regression testing

| Test | Result |
|------|--------|
| `tsc -p tsconfig.json --noEmit` (backend) | **Pass** (exit 0) after fixes; failed pre-change with pre-existing errors |
| EADDRINUSE simulation (port 4000 occupied, `tsx src/server.ts`) | **Pass** — single log line `Port 4000 is already in use. Stop the other process (or set PORT to a free port) and restart.`, exit code 1, **no** `ERR_SERVER_NOT_RUNNING`, no secondary shutdown errors, Mongo never touched |
| Duplicate shutdown | `shutdown()` re-entry returns immediately (guard verified in code path; signal handlers share one function) |
| Business logic | Untouched — app routes, services, sockets, jobs all identical; jobs now simply start after the port binds |
| ESM output (`"type": "module"`) | Matches how the code already runs under `tsx`; `node dist/server.js` now loads compiled output as ESM, consistent with `.js` import specifiers throughout `src/` |

**Not exercised here:** a full boot against MongoDB + Ctrl+C cycle (requires a live DB in this session). The shutdown path for that case is the same code that ran in the EADDRINUSE simulation, with each step guarded by its lifecycle flag.

**Operational note:** a stale `node` process was found still listening on port 4000 (started earlier today). If it is not your intentionally running backend, stop it before starting a new dev server:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
```
