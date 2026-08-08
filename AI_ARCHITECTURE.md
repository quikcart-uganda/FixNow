# FixNow AI Architecture

**Status:** Implemented as a modular, disableable subsystem  
**Constraint:** AI assists only — it never replaces marketplace, auth, messaging, push, reviews, or payments business logic  
**Reference inspiration:** QuikCart AI patterns (read-only study; QuikCart was not modified)

**Canonical docs (expanded):**
- [FIXNOW_AI_ARCHITECTURE.md](./FIXNOW_AI_ARCHITECTURE.md)
- [FIXNOW_AI_PROMPT_DESIGN.md](./FIXNOW_AI_PROMPT_DESIGN.md)
- [FIXNOW_AI_SAFETY.md](./FIXNOW_AI_SAFETY.md)
- [FIXNOW_AI_EVALUATION.md](./FIXNOW_AI_EVALUATION.md)

---

## 1. Design principles

1. **Subsystem, not core** — Auth, jobs, applications, messaging, push, reviews, and payments work with `AI_ENABLED=false`.
2. **Assist only** — The model explains and recommends. Mutations stay in existing FixNow APIs/screens.
3. **No duplicated marketplace logic** — AI tools call `technicianMarketplaceService`, `jobMarketplaceService`, `adminMarketplaceService`, `reviewService`, etc.
4. **Server-resolved roles** — Chat endpoints authorize `customer` / `technician` / `admin` from the JWT; the client cannot spoof role.
5. **Provider abstraction** — OpenAI, Gemini, and console (future providers plug into the same interface).
6. **Fail soft** — Missing keys or provider failures degrade to tool-grounded fallback text, never break the platform.

---

## 2. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Customer / Technician / Admin apps                         │
│  packages/api/aiApi.ts                                      │
└────────────────────────────┬────────────────────────────────┘
                             │ /api/v1/ai/*
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  routes → aiController → aiService                          │
│                                                             │
│  ai.config          feature flags + public status           │
│  assistants         role definitions + examples             │
│  prompts            system prompts (prompt manager)         │
│  context            safe role context builder               │
│  memory             AiConversation / AiMessage              │
│  tools              allowlisted wrappers → marketplace svc  │
│  providers/ai       console | openai | gemini               │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Existing FixNow domain services (source of truth)          │
│  jobs · technicians · customers · categories · admin ·      │
│  reviews · trust · messaging · payments …                   │
└─────────────────────────────────────────────────────────────┘
```

```mermaid
sequenceDiagram
  participant App as Role app
  participant API as /ai/{role}/chat
  participant Svc as aiService
  remnant Tools as Allowlisted tools
  participant Mkt as Marketplace services
  participant LLM as AI provider

  App->>API: message + optional context
  API->>Svc: chat(role from JWT)
  Svc->>Svc: buildRoleContext + conversation memory
  Svc->>Tools: detect + run allowlisted tools
  Tools->>Mkt: search / list / getById / dashboard…
  Mkt-->>Tools: live FixNow data
  Tools-->>Svc: sanitized tool results
  alt AI enabled + provider ready
    Svc->>LLM: system prompt + history + tool summary
    LLM-->>Svc: assistive text
  else disabled / failure
    Svc-->>App: fallback / disabled message
  end
  Svc-->>App: message + suggestions (no silent writes)
```

---

## 3. Folder structure

```text
backend/src/
  providers/ai/
    types.ts
    console.provider.ts
    openai.provider.ts
    gemini.provider.ts
    index.ts                 # getAiProvider()
  models/ai/
    AiConversation.ts        # AiConversation + AiMessage
  services/ai/
    ai.config.ts
    ai.service.ts            # orchestration
    assistants/index.ts      # role-aware assistant defs
    prompts/prompt.manager.ts
    context/context.manager.ts
    memory/conversation.service.ts
    tools/
      types.ts
      customer.tools.ts
      technician.tools.ts
      admin.tools.ts
      index.ts               # allowlists + intent → tools
  controllers/index.ts       # aiController
  routes/index.ts            # /ai/* routes
  config/env.ts              # AI_* flags
  middleware/rateLimit.ts    # aiRateLimiter

packages/api/aiApi.ts        # frontend client
packages/shared/
  AiAssistantPanel.tsx       # role-aware chat panel
  AiAssistantLauncher.tsx    # floating entry point, self-hiding
AI_ARCHITECTURE.md           # this document
```

The launcher is mounted once per app shell (`apps/customer/components/CustomerShell.tsx`,
`apps/technician/components/layout/AppShell.tsx`, `apps/admin/components/AdminShell.tsx`)
with the matching `role`. It calls `/ai/status` on mount and renders nothing when the
subsystem or that role's assistant is off, so disabling AI removes it from the UI entirely.

An optional guest welcome (`AiGuestWelcome` on `PlatformLanding`) appears when AI is enabled
but never opens authenticated chat or role tools — guests are guided to sign in.

---

## 4. API surface

Base prefix: `/api/v1`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/ai/status` | public | Feature flags / provider name (no secrets) |
| POST | `/ai/customer/chat` | customer | Customer assistant |
| POST | `/ai/technician/chat` | technician | Technician assistant |
| POST | `/ai/admin/chat` | admin | Admin assistant |
| GET | `/ai/conversations` | any role | List own AI conversations |
| POST | `/ai/conversations` | any role | Create conversation |
| GET | `/ai/conversations/:id/messages` | owner | Message history |
| DELETE | `/ai/conversations/:id` | owner | Soft-delete conversation |

Chat body:

```json
{
  "message": "Find a plumber in Kampala",
  "conversationId": "optional",
  "context": {
    "screen": "search",
    "district": "Kampala",
    "categoryId": "...",
    "jobId": "...",
    "budgetMax": 150000
  }
}
```

---

## 5. Role-aware assistants

| Assistant | Examples | Tools (read-only wrappers) |
|-----------|----------|----------------------------|
| Customer | Find technician, explain quotations, recommend services, estimate costs, booking help | `searchTechnicians`, `listCategories`, `getMyJobs`, `getJobDetails`, `getTechnicianPublicProfile` |
| Technician | Improve profile, suggest pricing, job recommendations, work summaries, customer communication | `getMyProfile`, `getDashboard`, `listNearbyJobs`, `listMyApplications`, `getJobDetails` |
| Admin | Platform analytics, moderation assistance, trust insights, growth recommendations | `getDashboard`, `getMarketplaceMetrics`, `getReviewAnalytics`, `listTechnicians`, `listJobs` |

**Forbidden for AI (by design):** posting jobs, accepting applications, payments, escrow release, suspensions, permission changes. Prompts and tool allowlists enforce this; users complete those actions in existing FixNow flows.

---

## 6. Provider abstraction

```ts
interface AiProvider {
  name: string;
  configured: boolean;
  completeChat(request): Promise<AiCompletionResult>;
}
```

| Provider | Env | Notes |
|----------|-----|-------|
| `console` | default / kill-switch | Deterministic local reply; no network |
| `openai` | `AI_PROVIDER=openai` + `OPENAI_API_KEY` | Chat Completions HTTP |
| `gemini` | `AI_PROVIDER=gemini` + `GEMINI_API_KEY` | generateContent HTTP |

Future providers: add a class under `providers/ai/`, register in `getAiProvider()` switch, extend `AI_PROVIDER` enum in `env.ts`.

No vendor SDKs required — HTTP fetch keeps the dependency surface small (same pattern as QuikCart inspiration).

---

## 7. Prompt manager

`services/ai/prompts/prompt.manager.ts`

- Per-role system prompts with shared hardening (no secrets, no invented data, no claimed mutations)
- `buildProviderMessages()` composes: system + optional context extras + conversation history + user message + tool summary

---

## 8. Context manager

`services/ai/context/context.manager.ts`

- Loads display name from `User`
- Accepts client hints (`screen`, `district`, `jobId`, …)
- Emits **safe** prompt text — no API keys, no internal dumps

---

## 9. Conversation memory

Models: `AiConversation`, `AiMessage`

- Owned by `ownerUserId` + `role`
- Soft archive on delete
- Toggle with `AI_CONVERSATION_HISTORY_ENABLED`
- History window: `AI_HISTORY_LIMIT` (default 12 turns)

---

## 10. Kill switches / configuration

```env
AI_ENABLED=false
AI_PROVIDER=console
AI_CUSTOMER_ASSISTANT_ENABLED=true
AI_TECHNICIAN_ASSISTANT_ENABLED=true
AI_ADMIN_ASSISTANT_ENABLED=true
AI_CONVERSATION_HISTORY_ENABLED=true
OPENAI_API_KEY=
GEMINI_API_KEY=
AI_MODEL=gpt-4o-mini
AI_RATE_LIMIT_MAX=60
```

| Switch | Effect |
|--------|--------|
| `AI_ENABLED=false` | Status reports disabled; chat returns role-disabled copy; provider forced to console |
| Per-role `*_ASSISTANT_ENABLED=false` | That role’s chat is disabled; others may remain on |
| Missing API key | Falls back to console provider |

Disabling AI does **not** unload routes for jobs, auth, messaging, push, reviews, or payments.

---

## 11. What AI must never do

- Own job status transitions or assignment
- Accept/reject applications
- Charge wallets / release escrow / approve payouts
- Suspend users or moderate reviews by itself
- Bypass JWT role checks
- Store provider secrets in client responses

AI may **recommend** next steps and deep-link users to the correct screen.

---

## 12. Extending safely

1. **New read tool** — wrap an existing service method; add to role allowlist; extend intent detection.
2. **New provider** — implement `AiProvider`; register in factory.
3. **Write actions** — prefer human confirmation + call existing controllers/services; do not put mutation logic inside the LLM path.
4. **Frontend UI** — reuse `AiAssistantPanel` from `@fixnow/shared`; it accepts a `role` and an
   optional `context` object, so a screen can pass `{ jobId }` or `{ categoryId, district }` to
   ground the answers. Anything new must keep the `/ai/status` gate.

---

## 13. Testing checklist

- [ ] `AI_ENABLED=false` → marketplace login/jobs/messages still work; `/ai/status` shows disabled
- [ ] Customer chat with console provider returns assist text and never creates jobs
- [ ] Technician chat cannot call admin tools
- [ ] Admin chat grounds answers in dashboard/metrics tools
- [ ] Conversation list is scoped to the authenticated owner
- [ ] Invalid/missing OpenAI key falls back without 500s crashing the API

---

*FixNow AI subsystem — assistive layer over existing platform services.*
