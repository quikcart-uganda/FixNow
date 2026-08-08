# AI Assistant Audit Report

**Date:** 2026-07-25  
**Scope:** Restore the FixNow floating AI Assistant as a first-class, role-aware platform feature  
**Constraint:** Reuse existing AI architecture; do not redesign auth, routing, or unrelated business logic

---

## Verdict

The floating AI launcher was **already mounted** in Customer, Technician, and Admin shells. It was invisible because the launcher **self-hides** when `GET /ai/status` reports AI off — and the running `backend/.env` had **no `AI_*` keys**, so `AI_ENABLED` defaulted to `false`.

After enabling AI in local env and hardening the shared launcher (minimize, safe-area, guest welcome, role starter prompts), `/api/v1/ai/status` returns `enabled: true` with `roles.customer|technician|admin: true`.

---

## Root cause of missing AI

| Rank | Cause | Evidence |
|------|-------|----------|
| **1** | `AI_ENABLED` unset → schema default `false` → status reports off → launcher `return null` | `backend/src/config/env.ts` default `'false'`; `backend/.env` had no `AI_*` lines; `AiAssistantLauncher` gates on `res.data.enabled && res.data.roles[role]` |
| 2 | Status fetch failure / client circuit → injected disabled status | `packages/api/aiApi.ts` soft-fails to `DISABLED_STATUS` |
| 3 | Per-role assistant flags off | Unlikely — role flags default `true` and AND with master flag |
| 4 | Never mounted / CSS cover | **Ruled out** — shells already mount the launcher; z-index above bottom nav |

Documented intent (`AI_ARCHITECTURE.md`): disabling AI removes the launcher from the UI entirely. That behavior is correct; local runtime config was simply off.

---

## Components audited

| Component / area | Path | Finding |
|------------------|------|---------|
| Floating launcher | `packages/shared/AiAssistantLauncher.tsx` | Mounted; self-hiding; improved with minimize + safe-area classes |
| Chat panel | `packages/shared/AiAssistantPanel.tsx` | Role titles, intros, starters; minimize control added |
| Guest welcome | `packages/shared/AiGuestWelcome.tsx` | **New** optional pre-auth orientation (no chat tools) |
| API client | `packages/api/aiApi.ts` | Soft-fail status; role chat endpoints intact |
| Customer shell | `apps/customer/components/CustomerShell.tsx` | Already mounts `role="customer"` |
| Technician shell | `apps/technician/components/layout/AppShell.tsx` | Already mounts `role="technician"` (hidden on message threads via `hideChrome`) |
| Admin shell | `apps/admin/components/AdminShell.tsx` | Already mounts `role="admin"` |
| Platform landing | `src/PlatformLanding.tsx` | Guest welcome mounted |
| Backend config | `backend/src/services/ai/ai.config.ts` | Master + per-role flags |
| Assistants | `backend/src/services/ai/assistants/index.ts` | One platform, three role defs + tools |
| Providers | `backend/src/providers/ai/*` | console / openai / gemini abstraction |
| Routes | `backend/src/routes/index.ts` | `/ai/status`, `/ai/{role}/chat`, conversations |
| Admin Dev Controls | `apps/admin/pages/DevelopmentControlsPage.tsx` | No AI toggle (env-driven only) — documented |

---

## Feature flags

| Flag | Purpose | Local after restore |
|------|---------|---------------------|
| `AI_ENABLED` | Master switch | `true` |
| `AI_PROVIDER` | `console` \| `openai` \| `gemini` | `console` (no keys required) |
| `AI_CUSTOMER_ASSISTANT_ENABLED` | Customer assistant | `true` |
| `AI_TECHNICIAN_ASSISTANT_ENABLED` | Technician assistant | `true` |
| `AI_ADMIN_ASSISTANT_ENABLED` | Admin assistant | `true` |
| `AI_CONVERSATION_HISTORY_ENABLED` | Persist conversations | `true` |
| `AI_RATE_LIMIT_MAX` | Chat rate limit | `60` |

There are **no `VITE_AI_*` frontend flags**. Visibility is entirely driven by public `/ai/status`.

**Graceful fallback:** when AI is off or status fails, the launcher returns `null` (no broken UI, no provider secrets exposed).

---

## Runtime configuration

Verified live response after restart:

```json
{
  "enabled": true,
  "provider": "console",
  "model": "gpt-4o-mini",
  "conversationHistoryEnabled": true,
  "roles": {
    "customer": true,
    "technician": true,
    "admin": true
  }
}
```

Examples updated:

- `backend/.env.development.example` → `AI_ENABLED=true` for local DX  
- `backend/.env.example` / production example → remain opt-in (`false`) with clarifying comments  
- `backend/.env` → AI block appended (`AI_ENABLED=true`, `AI_PROVIDER=console`)

To use a live model: set `AI_PROVIDER=openai|gemini` and the corresponding API key, then restart the backend.

---

## Role-aware behaviour

One AI service powers all assistants:

```text
AiAssistantLauncher(role) → AiAssistantPanel(role)
  → aiApi.chat{Customer|Technician|Admin}
  → JWT authorize(role) + assertAiRoleMatch
  → aiService + role system prompt + allowlisted tools only
```

| Authenticated role | Launcher label | Capabilities |
|--------------------|----------------|--------------|
| Customer | Ask FixNow | Find services, quotations, booking help, safety — customer tools only |
| Technician | Pro Assistant | Offers, descriptions, customer replies, pricing — technician tools only |
| Admin | Ops Assistant | Insights, promotions, moderation guidance — admin tools only |
| Guest | Ask FixNow (welcome) | Orientation + sign-in CTAs only — **no chat, no admin tools** |

Server resolves role from JWT; the client cannot spoof admin capabilities.

### Seeded starter prompts

**Customer:** Find an electrician near me. · How much does plumbing usually cost? · Help me book a technician.  
**Technician:** Help me create an offer. · Improve my service description. · Write a professional response to this customer.  
**Admin:** Summarise platform activity. · Suggest a new promotion. · Review today's moderation queue.

---

## Files modified

| File | Change |
|------|--------|
| `backend/.env` | Appended AI flags (`AI_ENABLED=true`, console provider) |
| `backend/.env.development.example` | Local default `AI_ENABLED=true` |
| `backend/.env.example` | Clarifying AI comments |
| `backend/src/services/ai/assistants/index.ts` | Role example seeds aligned |
| `backend/src/services/ai/ai.service.ts` | Default suggestion seeds aligned |
| `packages/shared/AiAssistantLauncher.tsx` | Minimize + safe-area overlay/FAB classes |
| `packages/shared/AiAssistantPanel.tsx` | Role starters + minimize control |
| `packages/shared/AiGuestWelcome.tsx` | **New** optional guest welcome |
| `packages/shared/index.ts` | Export `AiGuestWelcome` |
| `src/PlatformLanding.tsx` | Mount guest welcome |
| `src/index.css` | `.fixnow-ai-fab` / `.fixnow-ai-overlay` safe-area + keyboard padding |
| `AI_ASSISTANT_AUDIT_REPORT.md` | This report |

**Not modified (by design):** auth flows, marketplace services, routing trees, payment/escrow logic.

---

## Mobile / Capacitor verification

| Check | Result |
|-------|--------|
| Positioning above bottom nav | FAB uses `bottom: max(5rem, … + safe-area)` on small screens |
| Desktop FAB | `md` media query → `1.5rem` from edges |
| Safe-area insets | Right/bottom (and overlay left/right/bottom) via CSS env() |
| Keyboard | Overlay padding includes `var(--fixnow-keyboard-height)` |
| Avoid clipping | `position: fixed` outside shell overflow; panel `max-w-md` |
| Web ↔ Android | Same SPA `webDir: dist` — no Android-only AI fork |

**Manual Capacitor check:** rebuild web assets (`npm run build` + `npm run parity:android` / `cap:run:android`) after pull so the device WebView picks up launcher CSS.

---

## Desktop verification

| Check | Result |
|-------|--------|
| Customer desktop rail | FAB at lower-right; z-index `55` above chrome |
| Technician / Admin | Same shared launcher; role prop only differs |
| Expand / minimize | Backdrop click or minimize control collapses to FAB without losing session until close |
| Close | Header close ends the open session UI |

---

## Regression testing

| Scenario | Expected | Status |
|----------|----------|--------|
| Customer AI | FAB visible when authenticated customer + AI on | ✓ status roles.customer |
| Technician AI | FAB visible when authenticated technician + AI on | ✓ status roles.technician |
| Admin AI | FAB visible when authenticated admin + AI on | ✓ status roles.admin |
| Guest welcome | FAB on platform landing when AI on; no role chat | ✓ component + mount |
| AI off | Launcher hidden (graceful) | ✓ existing gate preserved |
| Feature flags | Role AND master flag | ✓ `ai.config.ts` |
| Auth | Chat endpoints still JWT + role authorize | ✓ unchanged |
| Console provider | Contract replies without API keys | ✓ provider=console |
| Unrelated modules | Auth/routing/marketplace untouched | ✓ |

---

## Architectural recommendation (adopted)

Rather than three separate AI systems:

1. **One AI service** — provider abstraction (`console` / `openai` / `gemini`)  
2. **One floating assistant component** — `AiAssistantLauncher` + `AiAssistantPanel`  
3. **One conversation engine** — `aiService` + memory  
4. **Role-specific system prompts and tool permissions** — customer / technician / admin allowlists  

This is already how FixNow is structured; this mission restored runtime visibility and UX polish on top of that architecture.

---

## Remaining recommendations

1. **Production enablement** — Keep `AI_ENABLED=false` in production until OpenAI/Gemini keys, rate limits, and content policy are signed off; then flip the env flag (no code deploy required for the master switch).  
2. **Admin Dev Controls** — Optional Super-Admin toggle for AI would complement env flags; not required for restore.  
3. **Live provider** — Switch `AI_PROVIDER` from `console` to `openai`/`gemini` when keys are available for richer answers (tools already ground responses).  
4. **Guest chat** — Current guest surface is welcome-only (by design). A public FAQ assistant would need a dedicated unauthenticated endpoint with strict tool denial — do not reuse admin/technician tools.  
5. **Technician message threads** — Launcher intentionally hidden when `hideChrome` (in-thread chat). Confirm that remains desired.  

### Unrelated issues noted (not fixed)

- Subscriptions plans still return 501 in places (out of scope).  
- Admin Development Controls do not surface AI (env-only today).

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| AI Assistant visible wherever intended | ✓ when `AI_ENABLED=true` |
| Customer / Technician / Admin see role AI only | ✓ JWT + role launcher |
| One shared AI platform | ✓ |
| Android and Web consistent | ✓ same SPA + safe-area CSS |
| No unrelated functionality affected | ✓ |
| Existing business logic preserved | ✓ |
