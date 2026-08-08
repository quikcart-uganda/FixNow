# Launch Centre Implementation Report

**Phase:** 4.3 — Production Readiness Wizard, Launch Centre & Controlled Production Activation  
**Date:** 2026-07-29  
**Depends on:** Phase 1–3 reports, `PRODUCTION_GOVERNANCE_ARCHITECTURE_REPORT.md`, `PRODUCTION_MODE_IMPLEMENTATION_REPORT.md`  
**Status:** Implemented on top of existing Platform Mode — authentication and Mode engines not redesigned  

---

## 1. Launch Centre architecture

```text
Launch Centre UI (PSA only)
    ↓
launchCentre.service
    ├── productionReadiness.service   (score / blockers / warnings)
    ├── promotionCentre.service       (clone queue)
    └── platformMode.service          (enter / return — unchanged contract)
```

| Surface | Path |
| --- | --- |
| Admin UI | `/admin/settings/launch-centre` → `LaunchCentrePage` |
| API | `/admin/launch-centre/*` |
| Client | `packages/api/launchCentreApi.ts` |

Access: `requireProductionSuperAdmin()` on all Launch Centre routes. Non-PSA users see setup links only.

Sections in overview: Overview, Readiness, Infrastructure/Security/Payments/Maps/Notifications/Legal/Branding/Public Content/Users/Owner/Environment (as scored categories), Promotion Centre, Launch History, Rollback History, System Health (DB readiness check).

---

## 2. Readiness engine

`backend/src/services/platform/productionReadiness.service.ts`

Evaluates live dependencies and content:

- MongoDB connection  
- Email provider (blocker on production host if `console`)  
- Cloudinary / media  
- JWT secrets, Dev Admin login, CORS  
- Subscription MoMo payee enabled  
- Google Maps keys  
- Push / FCM credentials  
- Published CMS: privacy, terms, cookies, home, help, contact, about, FAQ  
- Category count  
- Content blocks  
- Production technician density  
- Production Super Admin exists  

Redis is scored as N/A (not used in current stack).

---

## 3. Readiness scoring

Each check has `score` / `maxScore`. Category percents and **overall percent** are derived automatically on every `evaluate()`.

UI displays category tiles and overall score on the Overview tab.

---

## 4. Blocker system

Severity `blocker` → included in `blockers[]`.  
`canLaunch = blockers.length === 0 && hasProductionSuperAdmin`.

**Launch button disabled** when `!launchAllowed`.

`enterProductionMode` also refuses when blockers remain (`LAUNCH_BLOCKED`) unless emergency `skipReadinessGate` (not exposed by Launch Centre).

---

## 5. Warning system

Severity `warning` → non-blocking. Launch requires `acknowledgeWarnings` when warnings exist.

Recommendations list combines blocker guidance + top warnings.

---

## 6. Promotion Centre

`promotionCentre.service.ts` + expanded `sandbox.service.promoteToProduction`.

| Type | Clone behaviour |
| --- | --- |
| TechnicianOffer | Clone → production `pending` |
| SponsoredContent | Clone → production `draft` |
| ContentBlock | Clone → production `draft`, analytics reset |
| PlatformPromotion | Clone with unique code |
| CmsPage | Clone with unique slug, `draft` |
| Category | Clone with unique slug/name |
| PortfolioItem | Clone → production `pending` |

**Clone never move.** Skip/reject writes audit only.

---

## 7. Launch workflow

1. Review readiness (auto score)  
2. Resolve blockers  
3. Review / acknowledge warnings  
4. Optional Promotion Centre clones  
5. Confirm reason + type `PRODUCTION` + second confirmation  
6. Optional MFA (when required + enrolled)  
7. `launchCentre.launch` → `enterProductionMode`  
8. Launch history + audit  
9. Clients refresh via `/public/platform-mode` / nav hide  

---

## 8. Rollback workflow

`launchCentre.rollback` → `returnToDevelopmentMode` with `DEVELOPMENT` confirmation.

Restores Sandbox / Preview / Dev Access **snapshot** — no regenerate / reseed.

---

## 9. AI governance

`context.manager` adds `launchReady` and `readinessOverallPercent` for admin chats.

Production Mode prompt rules unchanged (no seed/sandbox/preview guidance). Development Mode may mention Launch Centre readiness without inventing secrets.

---

## 10. Android synchronization

Same backend Launch Centre + Platform Mode APIs. Capacitor web Admin uses Launch Centre UI; technician/customer apps only observe Mode via existing public endpoints — **no** native Mode/Launch implementation.

---

## 11. Audit logging

| Action | Storage |
| --- | --- |
| Launch / rollback / readiness snapshot | `platform_launch_centre_history` PlatformSetting + `writeAuditLog` |
| Mode transitions | `PlatformModeTransition` (Phase 4.2) |
| Promote / reject | `launch_centre.promote` / `.promote_reject` audit |

Fields: administrator, timestamp, reason, IP, device where provided.

---

## 12. Security implementation

- PSA-only routes (`requireProductionSuperAdmin`)  
- Typed confirmation + second confirm  
- Warning acknowledgement  
- Mode lock retained from Phase 4.2  
- MFA hook unchanged  
- Readiness gate on Mode enter  

---

## 13. Validation results

| Check | Status |
| --- | --- |
| Launch Centre PSA-only | Yes |
| Readiness score | Yes |
| Blockers disable launch | Yes |
| Warnings display + ack | Yes |
| Promotion clones | Yes (expanded types) |
| Production Mode activation | Via existing Mode service |
| Dev UX hidden post-launch | Phase 4.2 nav/API orchestration |
| Public/legal/categories remain | Content env unchanged |
| AI respects Mode + readiness | Yes |
| Android/Web same APIs | Yes |
| Rollback restores snapshot | Yes |
| No asset deletion | Yes |
| Audit trail | Yes |

---

## 14. Remaining recommendations

1. Automated probe jobs (email send test, maps ping, push dry-run)  
2. Four-eyes approval for launch on live traffic  
3. Richer Promotion Centre preview (media thumbnails, live HTML)  
4. Category promote conflict UX when slug already exists in production  
5. Continue Phase 4.1 P0: tighten coarse admin API RBAC  
6. Full MFA enrollment UX for Production Owner  
7. E2E Launch Centre matrix (Web + Android Admin shell)  

---

## Completion criterion

The platform can prepare for production via Launch Centre, validate readiness, guide a Production Super Admin through launch, activate Production Mode without deleting development assets, keep public content available, roll back to Development Mode from snapshot, and retain an audit trail of governance actions.
