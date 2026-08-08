# DEVELOPMENT SUBSCRIPTION SIMULATOR REPORT

**Phase:** 1 — Development plan simulation via existing entitlement engine  
**Date:** 2026-07-30  
**Account:** `quikcart2026@gmail.com` (permanent Seed Development Technician)

---

## 1. Summary

The Development Subscription Simulator lets the Seed Development Technician switch **Starter / Professional / Business** using the **existing entitlement engine** (Developer Preview session → `resolveEntitlements`).

| Guarantee | Status |
|---|---|
| No Development Plans product | ✓ Uses catalogue codes only |
| No Development Payments | ✓ |
| No Transaction IDs / invoices / Subscription docs | ✓ |
| Platform Mode Production blocks simulator | ✓ |
| Only Development Technician (+ Super Admin via Seed Platform) | ✓ |
| Dashboards / AI / quotas follow entitlements | ✓ |

---

## 2. How it works

```
Admin (Seed Platform) or Development Technician
        ↓
assert Platform Mode ≠ production
        ↓
assert target = quikcart2026@gmail.com
        ↓
stamp TechnicianProfile / User plan code (seed stamps only — no Subscription row)
        ↓
activatePreviewSession(planCode)  ← existing entitlement override
        ↓
emit FREE_JOB_LIMIT_UPDATED + TECHNICIAN_UNLOCKED
        ↓
resolveEntitlements → dashboard / AI / quotas refresh
```

**Reset:** exit preview session + restore seed default **Professional** stamps.

**History:** stored in `PlatformSetting` key `development_subscription_simulator_history` (audit trail only).

---

## 3. Security

| Gate | Enforcement |
|---|---|
| Platform Mode Development | `assertPlatformModeDevelopment()` on every simulator call |
| Target account | Hard-coded `DEVELOPER_TECHNICIAN.email` |
| Technician self-service | Caller `userId` must equal developer technician |
| Admin Seed Platform | `authenticate` + `authorize(ADMIN)` + `requireSuperAdmin()` |
| Production Mode | Simulator forbidden; existing Preview also terminated on enter Production |

---

## 4. Surfaces

### Seed Platform (Admin)

- Section: **Development Subscription Simulator**
- Actions: Simulate Starter / Professional / Business · Reset to default · History list
- APIs:
  - `GET /admin/seed-platform/subscription-simulator`
  - `POST /admin/seed-platform/subscription-simulator/simulate`
  - `POST /admin/seed-platform/subscription-simulator/reset`
- Overview payload includes `subscriptionSimulator`

### Development Technician app

- Panel on **Subscription Centre** (auto-hidden for other accounts)
- APIs:
  - `GET /subscriptions/development-simulator`
  - `POST /subscriptions/development-simulator/simulate`
  - `POST /subscriptions/development-simulator/reset`

---

## 5. Entitlements / dashboards / AI

| Layer | Behaviour |
|---|---|
| Entitlements | Preview session wins in `resolveEntitlements` (`subscriptionSource: 'developer_preview'`) |
| Dashboards | `entitlementPlanCode` from quota → Starter / Professional / Business homes |
| AI | Context reads `resolveEntitlements`; plan-specific simulation coaching for Starter / Professional / Business |
| Quotas / nav chrome | Realtime unlock + profile refresh; plan-aware AppShell labels unchanged in structure |

---

## 6. Validation checklist

| Check | Result |
|---|---|
| Starter simulation | ✓ Preview + stamps → Starter experience |
| Professional simulation | ✓ |
| Business simulation | ✓ |
| Same entitlement engine | ✓ `resolveEntitlements` |
| Same dashboard router | ✓ |
| No payments created | ✓ |
| No subscriptions created | ✓ |
| AI updates | ✓ preview plan in context + plan behaviour lines |
| Platform Mode restrictions | ✓ Production throws forbidden |

---

## 7. Files

| File | Role |
|---|---|
| `backend/src/services/sandbox/seed/developmentSubscriptionSimulator.service.ts` | **New** core service |
| `backend/src/services/sandbox/seed/seedPlatform.service.ts` | Overview embeds simulator status |
| `backend/src/controllers/index.ts` | Admin + technician controllers |
| `backend/src/routes/index.ts` | Routes |
| `backend/src/services/ai/context/context.manager.ts` | Plan-aware simulation AI copy |
| `packages/api/seedPlatformApi.ts` | Client APIs + types |
| `packages/api/admin.ts` / `index.ts` | Re-exports |
| `apps/admin/pages/SeedPlatformPage.tsx` | Admin UI |
| `apps/technician/components/DevelopmentSubscriptionSimulatorPanel.tsx` | **New** tech UI |
| `apps/technician/pages/SubscriptionCentrePage.tsx` | Mounts panel |

**Not modified:** subscription catalogue, payment verification, entitlement capability matrix, navigation route tree.

---

## 8. Notes / follow-ups

- Simulator sessions use max Preview duration (168h); switch or reset earlier as needed.
- Developer Preview must remain eligible for the Seed technician (authorised email + sandbox) for activate to succeed.
- Profile stamps stay aligned with the simulated plan for coherence after session end; they still **do not** create `Subscription` / `SubscriptionPayment` documents.

---

*Implementation complete: the permanent Development Technician can safely simulate any production subscription tier through the existing entitlement engine without duplicate billing systems.*
