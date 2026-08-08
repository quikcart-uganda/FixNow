# Technician AI Assistant Audit

**Date:** 2026-07-28  
**Scope:** FixNow Pro (Technician) assistant — full stack hardening  
**Companion:** `AI_PLATFORM_HARDENING_AUDIT.md`

---

## Current architecture

Technician chat uses the **shared** AI platform with role = `technician`:

| Layer | Path |
|-------|------|
| UI | `AppShell` → `AiAssistantLauncher role="technician"` → `AiAssistantPanel` |
| API | `POST /api/v1/ai/technician/chat` |
| Tools | `technician.tools.ts` — profile, dashboard, nearby jobs, applications, earnings, escrow, reviews, platform knowledge |
| Prompt | `technicianSystemPrompt` (Pro-only) |
| Memory | Conversations scoped `{ownerUserId, role:'technician'}` |
| Fallback | Local knowledge engine + tool summaries + soft message |

---

## Issues found

1. Console / no-provider path could answer like a **customer** assistant (“find technicians, post jobs”).
2. Cross-role filter was weak on “post a job / hire technician / cart”.
3. Starters over-emphasised generic “Create an offer”; under-emphasised nearby jobs, applications, earnings, portfolio.
4. Advanced writing requests failed with technical tone when no LLM.
5. Loading state did not communicate profile/context review.
6. Provider `error` strings could surface to the client.

---

## Fallback strategy

```text
Social greeting/thanks → conversational short-circuit
Simple Pro FAQ → localKnowledge.engine (immediate)
Tools (profile/jobs/earnings) → optional enrichment
Provider configured + advanced (draft/strategy) → LLM (+ retry)
Else → soft Pro message (no stack traces / no “provider missing”)
```

Example soft copy:

> I can help with general FixNow Pro guidance using built-in knowledge — profile tips, nearby jobs, pricing basics, and customer communication. For deeper personalised coaching or long-form drafts, the AI writing service needs to be available…

---

## Role-awareness improvements

**May suggest:** improve/complete profile, nearby jobs, applications, availability, pricing, portfolio, certificates, earnings, schedule, reply to customer, ratings/trust.

**Must not suggest:** post a job, find/hire technicians, customer checkout/cart, admin moderation.

Enforced via:

- Technician system prompt boundaries
- `detectCrossRoleViolation` patterns for technician
- Role-only tool allowlist
- Role-specific suggestions / deep links / starters

---

## Prompt improvements

`technicianSystemPrompt` rewritten as **FixNow Pro Assistant** with explicit never-list for customer/admin flows. Hardening block forbids grounding text, tool names, and provider errors in outputs.

---

## Timeout improvements

Uses shared `AI_REQUEST_TIMEOUT_MS` (30s) and `AI_PROVIDER_RETRY_COUNT` (default 1). UI keeps rotating “Thinking… / Reviewing… / Checking your technician profile…” until the full wait completes — no instant failure flash.

---

## Knowledge base design

Technician-relevant local topics:

| Topic | Guidance |
|-------|----------|
| Apply / nearby jobs | How to find and win leads |
| Profile / portfolio / certificates | Completion tips |
| Availability / schedule | Where to update |
| Pricing / quotations | Practical pricing tips |
| Customer communication | Etiquette + draft guidance (LLM when available) |
| Ratings / trust | How to improve |
| Earnings / payout / escrow | When paid; Earnings screen |
| Safety | Site safety reminders |
| Navigation | Pro menu map |

---

## UI improvements

- Greeting and help copy are Pro-specific.
- Starters: Nearby jobs, My applications, Improve profile, Upload portfolio, Set availability, Pricing tips, My earnings, Reply to customer.
- Media quick actions retained (work photo / upload / voice / help) — not duplicated with starters.
- Thinking labels rotate through profile-aware copy.

---

## Security review

| Control | Status |
|---------|--------|
| JWT + `authorize(TECHNICIAN)` | ✓ |
| Role assert in controller | ✓ |
| Read-only tools | ✓ |
| Output sanitizer (leaks / tool names / mutations) | ✓ fixed lastIndex |
| No provider error on client | ✓ scrubbed |
| Cross-role customer/admin asks blocked | ✓ |

---

## Regression results

| Test | Result |
|------|--------|
| Provider unavailable / console | Local Pro FAQ works |
| “How does escrow work?” as technician | Technician-oriented escrow answer |
| “Post a job” | Blocked with Pro redirect message |
| “Improve my profile” | Local profile guidance |
| “Draft a long business strategy” without LLM | Soft advanced-unavailable |
| Customer portal same account switch | Separate route + memory role |
| Leak phrases in model output | Redacted |

Automated eval harness: `backend/scripts/ai-eval.mjs` (extend with new cross-role cases as follow-up).

---

## Production readiness assessment

Technician AI is **assist-only**, **role-isolated**, and **useful offline of an LLM**. It is ready for production alongside Customer and Admin assistants on the shared platform.

**Optional next steps:** richer live profile-completion signals in context, vision for work photos, streaming drafts when a provider is configured.
