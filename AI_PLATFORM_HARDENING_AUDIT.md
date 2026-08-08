# AI Platform Hardening Audit

**Date:** 2026-07-28  
**Scope:** Shared FixNow AI platform — Customer · Technician · Admin  
**Constraint:** Harden the full stack (not prompts alone); reuse existing architecture.

---

## 1. Current architecture audit

End-to-end flow (unchanged structure, hardened internals):

```text
Portal shell (role prop)
  → AiAssistantLauncher (/ai/status gate)
  → AiAssistantPanel
  → packages/api/aiApi.ts
  → POST /api/v1/ai/{role}/chat  (JWT + authorize + assertAiRoleMatch)
  → aiService.chat
       1. Injection / cross-role safety
       2. buildRoleContext + conversation memory
       3. Social short-circuit OR tools
       4. Local knowledge engine (FAQ / how-to)
       5. Provider completeChat (+ retry) when configured
       6. Smart fallback (tools → soft natural message)
       7. sanitizeAndValidateResponse
       8. Secret-free telemetry
```

**Reuse:** Role-separated routes, allowlisted tools, circuit breaker, conversation memory, shared panel UI, platform canon.

---

## 2. Issues found

| Issue | Impact |
|-------|--------|
| Assistants fully off when `AI_ENABLED=false` | No useful guidance without an LLM |
| Console provider returned customer-biased stub for all roles | Role confusion in local mode |
| Provider errors returned on chat response | Possible vendor/stack leakage |
| Global-regex `.test()` + `.replace()` lastIndex bug | Intermittent missed redaction |
| Grounding phrases could echo into UI | “Ground your answer here” / tool names |
| No provider retry on timeout | Instant fall-through feel |
| FAQ always waited on provider path | Slow / useless when provider down |
| Technician starters leaned customer-adjacent (“Create offer” only) | Weaker Pro UX |
| Loading UI showed static “Thinking…” | Felt like instant failure on slow nets |

---

## 3. Role-awareness improvements

- Server remains authoritative: route + `authorize` + hardcoded `role` in controller.
- System prompts now **explicitly forbid** other-portal workflows.
- Cross-role detector expanded (e.g. technician cannot ask to post a job / hire / cart; customer cannot ask admin/tech ops).
- Suggestions + deep links are role- and focus-specific.
- Context screen hints cover technician portfolio, availability, jobs, marketing, and admin console.

---

## 4. Shared AI platform design

One orchestration service (`ai.service.ts`) with three role definitions (`assistants/index.ts`), three tool packs, one safety layer, one local knowledge engine, one fallback composer, one telemetry helper.

| Mode | When | Behaviour |
|------|------|-----------|
| **full** | `AI_ENABLED` + OpenAI/Gemini key | Local FAQ first when simple; else provider with retry |
| **local** | No key / console / `AI_ENABLED=false` | Local knowledge + tools; natural soft message for advanced asks |
| **disabled** | Role flag off | Soft “unavailable” + deep links |

`publicAiStatus` now reports `enabled` when any role assistant flag is on, plus `mode` / `providerConfigured`.

---

## 5. Customer AI improvements

- Starters: Book, Track, Post job, Applications, Payments, Support.
- Suggestions avoid technician/admin actions.
- Local FAQ: escrow, booking, payments, tracking, applications, navigation.
- Cross-role blocks for admin/tech tool requests.

---

## 6. Technician AI improvements

See companion **TECHNICIAN_AI_ASSISTANT_AUDIT.md**.

---

## 7. Admin AI improvements

- Starters: Platform health, Pending verifications, Review reports, Marketing, Analytics, Disputes, User search, System settings.
- Ops-only prompts; never booking/tech coaching.
- Local FAQ for moderation/verification navigation.

---

## 8. Local knowledge engine

**File:** `backend/src/services/ai/knowledge/localKnowledge.engine.ts`

- Role-scoped FAQ entries (escrow, booking, apply jobs, profile, availability, pricing, ratings, earnings, verification, notifications, navigation, safety, moderation).
- `shouldPreferLocalKnowledge` routes simple how-tos away from the LLM.
- `isAdvancedAiRequest` triggers polite “deeper assistance unavailable” copy when no provider.

---

## 9. Fallback engine

**File:** `backend/src/services/ai/fallback/smartFallback.ts`

Order on provider failure:

1. Local knowledge hit (if any)
2. Tool-grounded natural summary
3. Soft role-specific unavailable message

`scrubProviderErrorForClient` always clears `error` on the public chat payload.

Console provider returns `ok:false` (`local_only`) so orchestration owns the reply.

---

## 10. Timeout strategy

| Setting | Default |
|---------|---------|
| `AI_REQUEST_TIMEOUT_MS` | 30_000 |
| `AI_PROVIDER_RETRY_COUNT` | 1 (0–2) |
| Client chat timeout | 60_000 |

Flow: attempt → wait full timeout → one retry on timeout/network/429/503 → then fallback.  
Streaming is not implemented; single completion must finish before failure is declared.

---

## 11. Security hardening

- Leak regex lastIndex fixed via reset-before-test/replace.
- Expanded redaction: grounding phrases, tool names, vendor error tokens, keys, DB URIs.
- Injection patterns expanded (tool instructions / repeat prompt).
- Cross-role + privacy gates before tools/LLM.
- Claimed-mutation rewrite retained.
- Telemetry never logs message bodies or prompts.

---

## 12. Prompt architecture

`prompt.manager.ts` per-role system prompts + shared hardening + platform canon + conversation rules + safe context + tool data block (internal label sanitized if echoed).

---

## 13. UI improvements

- Rotating status: Thinking… / Reviewing your request… / Checking your account|technician profile|platform context…
- Typing indicator shows the same label.
- Role copy starters/help notes updated; media quick actions unchanged (camera/gallery/voice/help).
- Launcher remains available in **local** mode (status `enabled` when role flags on).

---

## 14. Performance considerations

- Local FAQ returns immediately (no provider wait).
- Tools still capped (max 4) and read-only.
- History window unchanged (`AI_HISTORY_LIMIT`, default 12).
- Circuit breaker retained (4 failures / 90s).

---

## 15. Regression testing

| Scenario | Expected |
|----------|----------|
| Customer FAQ “how does escrow work?” | Local knowledge, customer-safe |
| Technician “post a job” | Cross-role block |
| Technician “improve my profile” | Local / Pro guidance |
| Admin “book a plumber” | Cross-role / ops-only |
| `AI_ENABLED=false` | Local mode still answers FAQs |
| Provider timeout | Retry once → soft fallback, no raw error |
| Prompt injection | Safety reply |
| Role switch portals | Separate JWT routes + memory scope |

Manual QA: open each portal FAB, send FAQ + advanced ask + cross-role ask, with and without provider keys.

---

## 16. Production readiness assessment

| Criterion | Status |
|-----------|--------|
| One shared AI platform | ✓ |
| Three role-aware assistants | ✓ |
| Useful without provider | ✓ local knowledge |
| Provider only when needed | ✓ prefer-local + advanced routing |
| No internal prompt/tool leakage | ✓ hardened sanitizer |
| Graceful slow/unavailable provider | ✓ timeout + retry + soft fallback |
| Consistent mobile/desktop | ✓ shared panel |

**Remaining (non-blocking):** true token streaming, vision analysis, OpenAI↔Gemini failover cascade, larger injection eval corpus.

**Verdict:** Production-ready for assist-only multi-role deployment with local degradation.
