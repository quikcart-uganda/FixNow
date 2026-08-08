# Production Blocker Tracker — Phase 5

**Source:** `FINAL_PRODUCTION_CERTIFICATION_REPORT.md`  
**Resolution report:** `PRODUCTION_BLOCKER_RESOLUTION_REPORT.md`  
**Objective:** Clear certified P0 blockers and practical P1 issues so Launch Centre can legitimately recommend Commercial Launch Approved when host configuration is complete.

| ID | Description | Severity | Status | Files | Dependencies | Resolution strategy | Testing | Completion |
|----|-------------|----------|--------|-------|--------------|---------------------|---------|------------|
| P0-SMS | Commercial SMS delivery (console-only) | P0 | Done | `providers/sms/*`, `config/env.ts`, catalog, readiness | Twilio / Africa’s Talking credentials | Added `twilio` + `africastalking`; production forbids console | Unit TOTP/SMS path; readiness `sms_provider` | **Done** |
| P0-PAY | Live payment configuration / webhooks | P0 | Done (host must enable) | payments providers, readiness | `PAYMENTS_LIVE`, secrets | Retained live factory; readiness webhook check | Readiness + existing webhook idempotency | **Done** |
| P0-INV | Direct hire / job invitation API | P0 | Done | `job.service`, JobApplication, routes | Customer auth, notify | `POST /jobs/:id/invite` + accept reuse | Invite → accept path (code) | **Done** |
| P0-STUB | Stubbed admin user-status + settings | P0 | Done | `services/index.ts`, controllers, validators | PlatformSetting, User | Real status + settings APIs | PATCH/GET/PUT wiring | **Done** |
| P0-LC | Launch Centre host blockers | P0 | Host-dependent | Launch Centre / readiness | Host config | Operators complete PSA/legal/maps/MoMo/JWT/CMS | Launch Centre green when configured | **Host** |
| P1-RBAC | Coarse ADMIN-only routes | P1 | Done | `routes/index.ts` | Capabilities | Capability gates on high-risk admin surfaces | Capability 403 | **Done** |
| P1-MFA | Production Super Admin MFA | P1 | Done | totp utils, adminIdentity, platformMode | `ADMIN_REQUIRE_MFA` | TOTP enroll/verify; mode change verifies | `totp.test.ts` | **Done** |
| P1-REM | Remember-me TTL lost on refresh | P1 | Done | `Session.ts`, `auth.service.ts` | JWT remember TTL | Persist `rememberMe` on RefreshToken | Login remember → refresh | **Done** |
| P1-ENT | Automated entitlement tests | P1 | Done | `entitlements.can.test.ts` | Vitest/node:test | Unit `can()` | Pass | **Done** |
| P1-SAN | Sandbox isolation tests | P1 | Done | `dataEnvironment.test.ts` | — | Bucket + assertSame tests | Pass | **Done** |
| P1-SUBPAY | Subscription MoMo = manual approve | P1 | Documented | `subscription.service` | Admin approve | Keep intentional escrow-style approve | Ops process | **Documented** |
| P1-NOTIFY | Email/SMS prefs not in notifyUser | P1 | Done | `push.service`, preferences | Email/SMS providers | Fan-out per prefs | Prefs gate | **Done** |
| P1-BOOT | Bootstrap / Production Owner race | P1 | Done | adminIdentity, productionOwner | AdminBootstrapState / PlatformSetting | Atomic claim locks | Concurrent-safe claim | **Done** |

**Legend:** Done | Documented (accepted residual) | Host-dependent
