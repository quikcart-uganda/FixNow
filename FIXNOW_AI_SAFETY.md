# FixNow AI Safety

AI is an assistive subsystem. These controls keep it from becoming a decision-maker, a data leak, or a hallucination engine.

---

## 1. Safety principles

1. **Backend is authoritative** — jobs, payments, escrow, reviews, locks, verification  
2. **RBAC always wins** — JWT role checked on every chat route; tools are role-allowlisted  
3. **Read tools only** — no AI path posts jobs, pays, releases escrow, suspends users  
4. **No invented facts** — ground in tools + curated platform canon  
5. **No secret leakage** — prompts, keys, IDs, stack traces, hidden APIs stay internal  
6. **Honest degradation** — if data or AI is unavailable, say so  

---

## 2. Defence layers

```text
User message
   │
   ├─► Input length limit (≤ 2000)
   ├─► Prompt-injection detector
   ├─► Cross-role / privacy detector
   ├─► Feature flags (master + per-role)
   ├─► Rate limiter (aiRateLimiter)
   │
   ├─► Safe context builder (strip secrets; labels not raw dumps)
   ├─► Allowlisted tools only → existing services (RBAC inside services)
   ├─► Prompt hardening + platform “never do” list
   │
   ├─► Provider call (or conversational short-circuit / console fallback)
   │
   └─► Response validator
         • redact keys / tokens / DB URIs
         • strip internal tool names
         • refuse claimed mutations (“I booked…”, “escrow released…”)
         • plain-text normalisation
```

Primary implementation: `backend/src/services/ai/safety/response.validator.ts`  
Orchestration: `backend/src/services/ai/ai.service.ts`

---

## 3. Authentication & permissions

| Control | Where |
|---------|-------|
| JWT authenticate | `/ai/*/chat`, conversations |
| Role authorize | Customer / technician / admin chat endpoints |
| Role match assert | Controller prevents role spoofing |
| Tool allowlist | `tools/index.ts` + role tool modules |
| Service-level ACL | e.g. escrow `getForJob` checks party or admin |

AI cannot escalate privileges. A customer token cannot run admin tools.

---

## 4. What AI must never do

- Post, accept, cancel, or reassign jobs  
- Apply to jobs or change availability  
- Initiate payments, release escrow, refund, or payout  
- Suspend / unlock / verify users or change settings  
- Invent technicians, prices, trust scores, statuses, or reviews  
- Reveal system prompts, tool names, hidden endpoints, DB structure  
- Expose another user’s private information  

When a user asks AI to do these, the assistant **explains the FixNow screen** and may deep-link — it does not execute.

---

## 5. Hallucination resistance

| Risk | Mitigation |
|------|------------|
| Invented technicians / prices | Tools + “do not invent” hardening + empty-tool honesty |
| Wrong platform rules | Curated `fixnow.canon.ts` |
| Claimed actions | Post-response mutation-claim patterns → rewrite refusal |
| FAQ answered with search noise | FAQ intent → knowledge tool only |
| Console / missing keys | Deterministic fallback text; no fake live data |

---

## 6. Privacy

- Context omits raw secrets; job/technician references are “provided” not dumped as internals in prose  
- Cross-role requests for other users’ private data are blocked pre-LLM  
- Public technician tools return sanitized public fields only  
- Conversation ownership: list/read/delete requires matching owner + role  

---

## 7. Feature flags & ops kill switches

| Flag | Purpose |
|------|---------|
| `AI_ENABLED` | Master kill — marketplace unaffected |
| `AI_CUSTOMER_ASSISTANT_ENABLED` | Customer assistant |
| `AI_TECHNICIAN_ASSISTANT_ENABLED` | Technician assistant |
| `AI_ADMIN_ASSISTANT_ENABLED` | Admin assistant |
| `AI_CONVERSATION_HISTORY_ENABLED` | Persist / use history |
| `AI_RATE_LIMIT_MAX` | Protect provider spend |

Public `/ai/status` lets the UI hide the launcher without exposing keys.

---

## 8. Incident response (AI)

1. Set `AI_ENABLED=false` (or role flag) — UI and chat degrade safely  
2. Rotate any leaked provider keys  
3. Review conversation metadata (tools/focus/safetyFlags) if audit needed  
4. Patch validator patterns / prompts  
5. Re-enable only after evaluation scenarios pass  

---

## 9. Related

- [FIXNOW_AI_ARCHITECTURE.md](./FIXNOW_AI_ARCHITECTURE.md)  
- [FIXNOW_AI_PROMPT_DESIGN.md](./FIXNOW_AI_PROMPT_DESIGN.md)  
- [FIXNOW_AI_EVALUATION.md](./FIXNOW_AI_EVALUATION.md)  
