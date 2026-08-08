# Platform AI Orchestration Implementation Report

**Date:** 2026-07-28  
**Scope:** FixNow Platform Intelligence Layer — orchestration over existing services (not a parallel AI backend)  
**Sources reviewed:** AI hardening audit, free-jobs / subscription / boost / admin RBAC reports, existing `ai.service` + tools spine

---

## 1. Platform ingestion architecture

AI does **not** reimplement FixNow. Ingestion is layered:

| Layer | Source of truth |
|-------|-----------------|
| Live state | Existing marketplace / payment / admin services via allowlisted tools |
| Behaviour rules | `fixnow.canon.ts` (updated for orchestration + RBAC) |
| Screens & workflows | `platformGraph.ts` knowledge graph |
| Permissions | Same Admin capability engine + JWT role gates as the apps |
| Writes | `AiPendingAction` → confirm → **same** `jobService` / `technicianService` APIs the UI uses |

Pipeline (unchanged entry: `aiService.chat`):

```
Safety → Context → Memory → Intent/tools → Orchestration tools
→ Local knowledge / Provider → Validate → Response (+ pendingActions / navigateTo)
```

---

## 2. Knowledge graph

**File:** `backend/src/services/ai/knowledge/platformGraph.ts`

Graph-lite nodes: `screen`, `workflow`, `api`, `plan`, `module`.

- Role-filtered (customer / technician / admin)
- Admin nodes require capabilities (`CanManageFinance`, `CanManageSupport`, …)
- Navigation: `findNavigation(role, query, capabilities)` → existing `href` only
- Prompt helper: `describeWorkflowsForPrompt` / `platformGraphSummary`

No invented hidden screens for roles that lack access.

---

## 3. Customer AI capabilities

**Read tools (existing):** search, categories, jobs, escrow, wallet, reviews, platform knowledge  

**Orchestration:**

| Intent | Behaviour |
|--------|-----------|
| “I need an electrician…” | `prepareCreateJob` — collect missing fields conversationally; pending confirm → `jobService.create` |
| “Cancel my job” | `prepareCancelJob` — confirm → `jobService.cancel` |
| “Take me to …” | `navigateToScreen` → deep link / soft navigate |
| Workflow map | `getWorkflowMap` |

Guest Mode: discovery + navigation only; private tools refused at **execute** time (`GUEST_CUSTOMER_TOOLS`).

---

## 4. Technician AI capabilities

**Read tools (existing):** profile, dashboard, nearby jobs, applications, earnings, escrow, reviews  

**Orchestration:**

| Intent | Behaviour |
|--------|-----------|
| Upgrade / Professional / Business | `guideSubscriptionUpgrade` → `/technician/upgrade` (never auto-activates) |
| Create offer / advert | `guideCreateOffer` → marketing create + approval explanation |
| Hide availability / offline | `prepareAvailabilityUpdate` → confirm → `technicianService.updateAvailability` |
| Navigate portfolio / boosts / subscription | `navigateToScreen` |

Entitlement limits remain enforced by subscription / marketing services when the technician uses those screens.

---

## 5. Admin AI capabilities

**Read tools (existing):** dashboard, metrics, reviews analytics, technicians, jobs, payments, escrow  

**Orchestration:** navigation + workflow map  

**Capability filter:** each admin tool maps to `CanManage*` keys; denied tools return `capability_denied` and are audited.

---

## 6. Finance Admin AI permissions

Allowed (when capabilities resolve true):

- Payments / escrow / settlements overviews  
- Subscription / boost finance modules via navigation when `CanManageSubscriptions` / `CanManageFinance`  
- Reports / audit **read** where permitted  

Refused:

- Administrator / role management screens  
- Development Access / Provider Manager  
- Support-only queues when capability missing  

Example: “Show me admin users” → no admins screen in graph for Finance; navigate refuses; tools for identity not selected.

---

## 7. Support Admin AI permissions

Allowed:

- Technicians, customers, jobs, verification, CMS, marketing moderation (via capabilities)  
- Operational navigation  

Refused:

- Payments / escrow / revenue tools (`CanManageFinance` false)  
- Super Admin settings / Development Access / Provider Manager  

Example: “Show me platform revenue” → payment tools filtered out; AI must not invent revenue figures.

---

## 8. Super Admin AI permissions

Wildcard / full capabilities → all admin tools + all admin graph screens (including Development Access and Administrators).

Still: **no direct DB writes**; mutations that are added later must use pending confirm + existing services.

---

## 9. Role-aware authorization model

| Gate | Mechanism |
|------|-----------|
| HTTP | `authenticate` + `authorize(role)` on `/ai/{role}/chat` |
| Controller | JWT role must match endpoint |
| Tools | Role allowlist + guest execute guard |
| Admin tools | `ADMIN_TOOL_CAPABILITIES` + `resolveCapabilities` |
| Graph | `adminCapabilities` on nodes |
| Writes | Pending action owned by `userId`; confirm/cancel require JWT |

Zero leakage principle: knowledge of restricted modules is capability-filtered in the graph and tool runner.

---

## 10. Workflow orchestration engine

**Confirmable writes**

1. Intent tool creates `AiPendingAction` (15-minute TTL)  
2. Chat returns `pendingActions[]`  
3. UI Confirm → `POST /ai/actions/:id/confirm` → `executeWorkflow` → marketplace service  
4. Cancel → `POST /ai/actions/:id/cancel`  

**Workflows implemented**

- `customer.createJob` → `jobMarketplaceService.create`  
- `customer.cancelJob` → `jobMarketplaceService.cancel`  
- `technician.availability` → `technicianMarketplaceService.updateAvailability`  

**Navigation / guides** execute without pending action (read-only / deep link).

---

## 11. API integrations

| Endpoint | Purpose |
|----------|---------|
| Existing `/ai/*/chat` | Orchestrated chat (now returns `pendingActions`, `navigateTo`) |
| `POST /ai/actions/:id/confirm` | Confirm pending write |
| `POST /ai/actions/:id/cancel` | Cancel pending write |

All write execution paths call **existing** marketplace services only.

---

## 12. Security model

- No MongoDB writes from the LLM  
- No bypass of validation / job transitions / availability rules  
- Guest cannot prepare job cancel / create  
- Admin finance/support separation via capability engine  
- Response validator labels updated for orchestration tools  
- Canon forbids claiming writes succeeded before platform confirm  

---

## 13. Audit logging

| Store | Content |
|-------|---------|
| `AiActionAudit` | tool_run, pending_created/confirmed/cancelled/failed, navigation |
| Platform `writeAuditLog` | `ai.orchestrate.{workflowId}` on successful confirm |
| Conversation metadata | tools / focus (existing) |

No raw chat bodies in `AiActionAudit` meta beyond short summaries.

---

## 14. Android / Web parity

Shared:

- `packages/shared/AiAssistantPanel` + `AiMessageBubble` confirm cards  
- `packages/api/aiApi` confirm/cancel  
- Same backend orchestration  

Capacitor WebView and web use identical React routes for `navigateTo` / deep links.

---

## 15. Validation results

| Check | Status |
|-------|--------|
| AI uses existing services for writes | Pass (pending → job/availability services) |
| Guest cannot run private tools at execute | Pass |
| Finance cannot select payment-denied tools incorrectly | Pass (capability map) |
| Support cannot open finance graph nodes | Pass |
| Super Admin full graph | Pass |
| Confirm UI on web/shared panel | Pass |
| Subscription upgrade never auto-activated | Pass (guide + deep link only) |
| Stack traces not returned to clients | Pass (AppError / sanitized messages) |

Manual QA recommended: Finance vs Support chat prompts for revenue / admins; customer job create confirm; technician availability confirm.

---

## 16. Future roadmap

1. Expand confirmable workflows: accept quotation, reschedule, portfolio create, offer draft create via marketing services.  
2. Formal JSON tool registry with Zod schemas (LLM tool-calling optional).  
3. Multi-slot conversation state machine for long booking dialogues.  
4. Admin AI write actions (approve subscription payment) — Super/Finance only, always confirm.  
5. Embeddings over graph + help CMS for retrieval.  
6. Eval suite scenarios for RBAC leakage and confirm/cancel.

---

## Key files

| Path | Role |
|------|------|
| `backend/src/services/ai/knowledge/platformGraph.ts` | Knowledge graph |
| `backend/src/services/ai/tools/orchestration.tools.ts` | Orchestration tools |
| `backend/src/services/ai/tools/index.ts` | Intent + guest + admin capability gates |
| `backend/src/services/ai/orchestration/pendingAction.service.ts` | Pending confirm/execute |
| `backend/src/models/ai/AiPendingAction.ts` | Pending + audit models |
| `backend/src/services/ai/ai.service.ts` | Response extras |
| `packages/shared/AiAssistantPanel.tsx` / `AiMessageBubble.tsx` | Confirm UI + navigate |
| `packages/api/aiApi.ts` | Client confirm/cancel |

---

**Completion criteria:** FixNow AI is a **secure orchestration layer** over the existing platform — conversational task execution with confirmation, role-aware tools, and no second implementation of business logic.
