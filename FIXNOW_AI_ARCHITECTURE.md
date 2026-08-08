# FixNow AI Architecture

**Status:** Production-oriented assistive subsystem  
**Principle:** AI assists. Backend APIs, RBAC, and business logic remain the source of truth.

---

## 1. Mission

FixNow AI must feel like an intelligent **platform expert** — specialised in FixNow workflows — while remaining a modular subsystem that can be disabled without breaking the marketplace.

It must understand:

- the FixNow platform (jobs, technicians, payments, escrow, reviews, trust, verification, subscriptions)
- user intent (including implicit intent)
- multi-turn conversation context
- user role (customer / technician / admin)
- platform rules and permissions

It must **never**:

- replace backend business logic
- make marketplace decisions authoritatively
- invent platform data
- bypass authentication or RBAC
- expose private data, prompts, hidden APIs, or database structure

---

## 2. High-level design

Inspired by QuikCart’s **tools-first, LLM-second** pattern (read-only reference), adapted for FixNow’s technician marketplace.

```text
┌─────────────────────────────────────────────────────────────┐
│ Customer / Technician / Admin portals                       │
│ AiAssistantLauncher + AiAssistantPanel (@fixnow/shared)   │
│ packages/api/aiApi.ts                                       │
└────────────────────────────┬────────────────────────────────┘
                             │ /api/v1/ai/*
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Controllers (thin) → aiService.chat                         │
│  1. Safety pre-checks (injection / cross-role / privacy)    │
│  2. Context manager (safe role context + screen hints)      │
│  3. Conversation memory (history window)                    │
│  4. Conversational core (social short-circuit, focus)       │
│  5. Intent → allowlisted READ tools → existing services     │
│  6. Prompt manager (role + platform canon + rules)          │
│  7. Provider (OpenAI / Gemini / console)                    │
│  8. Response validator / sanitizer                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Folder map

```text
backend/src/
  providers/ai/                 # AiProvider abstraction
  models/ai/AiConversation.ts   # conversations + messages
  services/ai/
    ai.config.ts                # feature flags
    ai.service.ts               # orchestration
    assistants/                 # role definitions
    prompts/prompt.manager.ts
    knowledge/fixnow.canon.ts # platform knowledge pack
    conversation/               # conversational intelligence
    context/context.manager.ts
    memory/conversation.service.ts
    safety/response.validator.ts
    tools/                      # allowlisted read tools
  routes / controllers          # /ai/* surface
  middleware/rateLimit.ts       # aiRateLimiter

packages/api/aiApi.ts
packages/shared/AiAssistantPanel.tsx
packages/shared/AiAssistantLauncher.tsx

backend/scripts/ai-eval.mjs
FIXNOW_AI_ARCHITECTURE.md       # this file
FIXNOW_AI_PROMPT_DESIGN.md
FIXNOW_AI_SAFETY.md
FIXNOW_AI_EVALUATION.md
```

---

## 4. Components

| Component | Responsibility |
|-----------|----------------|
| **Provider abstraction** | `completeChat()` for OpenAI, Gemini, console; kill-switch falls back to console |
| **Prompt manager** | Role system prompts + platform canon + conversation rules |
| **Context manager** | Safe display fields, screen hints; no secrets / raw IDs in prose |
| **Conversation manager** | Create/list/delete threads; ownership by user+role |
| **Memory manager** | History window for multi-turn; correction / pronoun guidance |
| **Conversational core** | Social short-circuits, focus inference, FAQ vs search routing |
| **Tools** | Read-only wrappers around existing FixNow services |
| **Safety layer** | Pre-LLM blocks + post-LLM sanitizer / mutation-claim refusal |
| **Feature flags** | `AI_ENABLED`, per-role flags, history, rate limits |

---

## 5. API surface

Base: `/api/v1`

| Method | Path | Auth |
|--------|------|------|
| GET | `/ai/status` | Public readiness (no secrets) |
| POST | `/ai/customer/chat` | Customer JWT + rate limit |
| POST | `/ai/technician/chat` | Technician JWT + rate limit |
| POST | `/ai/admin/chat` | Admin JWT + rate limit |
| GET/POST/DELETE | `/ai/conversations*` | Authenticated owner |

Chat body: `{ message, conversationId?, context? }`  
Context may include: `screen`, `jobId`, `technicianId`, `categoryId`, `district`, budget hints.

---

## 6. Role assistants

| Role | Expert domain | Tools (read-only examples) |
|------|---------------|----------------------------|
| Customer | Find techs, quotes, booking, escrow, reviews, tracking | search, categories, jobs, profile, reviews, escrow, wallet, knowledge |
| Technician | Profile, pricing, nearby jobs, earnings, communication | profile, dashboard, nearby jobs, applications, earnings, reviews, knowledge |
| Admin | Analytics, moderation, trust, payments overview | dashboard, metrics, reviews analytics, technicians, jobs, payments/escrow overview, knowledge |

**All mutations stay in FixNow UI/APIs.** AI may deep-link; it never executes.

---

## 7. Kill switches

| Env | Effect |
|-----|--------|
| `AI_ENABLED=false` | Console provider / disabled responses; marketplace unaffected |
| `AI_*_ASSISTANT_ENABLED=false` | That role’s assistant off |
| Missing API keys | Soft-degrade to console provider |

Launcher self-hides when `/ai/status` reports the role disabled.

---

## 8. UI integration

- Shared floating launcher in Customer, Technician, and Admin shells
- Panel: starters, multi-turn chat, history, new chat, suggestion chips, deep links
- Tool chips show **human labels** (never internal tool identifiers)
- Pathname passed as `screen` context automatically

---

## 9. Extending safely

1. **New read tool** — wrap an existing service; add to role allowlist; extend intent detection.
2. **New provider** — implement `AiProvider`; register in factory.
3. **Writes** — require human confirmation in UI + call existing controllers; never silent LLM mutations.
4. **Knowledge** — update `fixnow.canon.ts` when platform behaviour changes; keep it short and factual.

---

## 10. Related docs

- [FIXNOW_AI_PROMPT_DESIGN.md](./FIXNOW_AI_PROMPT_DESIGN.md)
- [FIXNOW_AI_SAFETY.md](./FIXNOW_AI_SAFETY.md)
- [FIXNOW_AI_EVALUATION.md](./FIXNOW_AI_EVALUATION.md)
- [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) (earlier implementation notes)
