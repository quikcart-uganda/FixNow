# FixNow AI Prompt Design

How FixNow assistants are prompted to behave like platform experts — not generic chatbots.

---

## 1. Prompt stack (composition order)

Every LLM call assembles:

1. **Role system prompt** — customer / technician / admin personality + domain scope  
2. **Platform knowledge pack** — `services/ai/knowledge/fixnow.canon.ts`  
3. **Shared conversation rules** — multi-turn, corrections, plain text, honesty  
4. **Safety hardening** — non-negotiable refuse/claim rules  
5. **Safe role context** — display name, screen hint, district, budget (no secrets)  
6. **Memory guidance** — correction notes, pronoun/focus continuation  
7. **Conversation history** — last N user/assistant turns  
8. **Current user message** + **safe tool results** (when any)

Social greetings/thanks/goodbyes often **short-circuit** before the LLM (deterministic, varied replies).

---

## 2. Personality

| Trait | Practice |
|-------|----------|
| Professional | Accurate FixNow language (escrow, applications, trust) |
| Friendly | Warm openers; never stiff corporate filler |
| Helpful | Concrete next steps inside FixNow screens |
| Natural | Conversational; vary wording |
| Confident | Clear guidance when data exists |
| Accurate | Ground in tools + canon; admit gaps |
| Concise | Prefer short answers; one clarifying question when ambiguous |

**Never:** robotic, repetitive capability dumps, verbose essays, markdown walls.

---

## 3. Role prompts (intent)

### Customer

Understands: finding technicians, quotations, booking, pricing, payments, escrow, reviews, tracking, support.

Example behaviours encoded in the prompt:

- “fix my sink” → plumbing intent  
- “don’t want the cheapest” → prefer trust/value  
- “can I trust him?” → reviews + trust signals  
- “book him tomorrow” → explain booking steps; never claim booked  

### Technician

Understands: jobs, pricing, availability, profile, performance, earnings, reviews, customer communication.

Guides to screens for apply / availability / payout — never auto-applies.

### Admin

Understands: analytics, moderation, trust, platform health, growth, operations.

Recommends inspections in admin UI — never suspends, releases escrow, or changes settings.

---

## 4. Platform knowledge pack

The canon documents:

- Roles and responsibilities  
- Service category examples (live list still from tools)  
- Job lifecycle status meanings  
- Booking → pay → escrow → complete → review flow  
- Payments & escrow rules (AI never releases)  
- Reviews, reputation, trust, badges  
- Verification, subscriptions, free jobs, locks  
- Notifications & messaging boundaries  
- Explicit “what AI must never do” list  

Update this file when FixNow behaviour changes. Keep it factual and short.

---

## 5. Conversational intelligence

Implemented in `conversation/conversational.core.ts`:

| Capability | Mechanism |
|------------|-----------|
| Implicit intent | Domain focus detectors (plumbing cues, trust cues, etc.) |
| Multi-turn | History window + focus inference from recent assistant turns |
| Follow-ups / references | Pronoun/“that quote” → continue `historyFocus` |
| Corrections | `isCorrectionMessage` injects discard-wrong-assumption guidance |
| Ambiguity | Prompt rule: ask **one** clarifying question |
| FAQ vs search | Platform FAQ → knowledge tool; avoid search spam |
| Social | Deterministic short-circuit with hashed variants |

---

## 6. Tool result grounding

Tool summaries are injected as:

> Safe FixNow tool results (ground your answer here — do not invent beyond this)

If tools fail or are empty, the prompt requires honesty + a short follow-up — not fabrication.

---

## 7. Output style rules

- Plain text only  
- No internal tool names (also stripped by validator)  
- No claim of completed marketplace actions (also blocked by validator)  
- Prefer guiding deep links over inventing UI steps  

---

## 8. Editing prompts safely

1. Change role copy in `prompt.manager.ts`  
2. Change platform facts in `fixnow.canon.ts`  
3. Change social/focus behaviour in `conversational.core.ts`  
4. Re-run evaluation scenarios in `FIXNOW_AI_EVALUATION.md` / `scripts/ai-eval.mjs`  
5. Never put secrets, env dumps, or raw schema into prompts  
