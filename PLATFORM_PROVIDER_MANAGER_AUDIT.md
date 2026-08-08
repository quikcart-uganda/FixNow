# Platform Provider Manager Audit

**Date:** 2026-07-28

---

## 1. Current provider audit

| Type | Before | After |
|------|--------|-------|
| AI | Env factory (`console`/`openai`/`gemini`) | Registry + Manager + Admin activate; local knowledge when None |
| Email | Env factory (`console`/`resend`/`smtp`) | Manager-aware cache clear; catalog includes planned vendors |
| SMS | Console only | Catalog + None; planned Twilio/AT/Infobip |
| Maps | Hardcoded Google Maps JS | Catalog; None → text fallback; Mapbox/HERE/OSM planned |
| Push | FCM / console | Catalog + status; OneSignal planned |
| Monitoring | Optional Sentry | Catalog + None |
| Storage | local / Cloudinary / auto | Manager cache + planned S3/R2 |
| Payments | Multi-adapter + env default | Runtime override from Manager |
| Analytics / CAPTCHA / Search | Absent | Catalog None + planned placeholders |

**Gaps closed:** no central Admin UI; `enableMockProviders` still not forcing all factories (documented debt).  
**Reuse:** existing `backend/src/providers/*` factories — Manager selects id; factories still own transport.

---

## 2. Supported providers

See `provider.catalog.ts` and `PROVIDER_CONFIGURATION_GUIDE.md`. Every type includes **None**.

---

## 3. Registry architecture

```text
provider.catalog.ts     → declarative definitions (env keys, guidance, planned/implemented)
provider.manager.ts     → discover · activate · deactivate · test · failover resolve
PlatformSetting keys    → providers.selections | providers.failover | providers.health
Admin API               → /admin/providers*
Admin UI                → /admin/settings/providers
```

---

## 4. Provider interfaces

Domain interfaces remain (AiProvider, EmailProvider, PaymentProvider, MediaStorageProvider).  
Manager is the **selection** layer, not a single mega-interface — avoids breaking typed adapters.

---

## 5. Database changes

No new collections. Uses existing `PlatformSetting`:

| Key | Value |
|-----|-------|
| `providers.selections` | `{ ai: 'openai', email: 'resend', ... }` |
| `providers.failover` | `{ ai: 'gemini', ... }` |
| `providers.health` | last test results (non-secret) |

---

## 6. Admin UI

**Provider Manager** — configured/active badges, missing env list, Activate / Set None / Test connection, restart warnings.  
**Realtime diagnostics** — socket + frontend dump + active provider snapshot.

---

## 7. Environment integration

Env remains source of truth for credentials. Discovery reads `env` + `process.env` for planned keys. Never overwrites `.env`.

---

## 8. Health monitoring

On-demand **Test connection** persists latency/message into `providers.health`. Continuous quota scraping is not yet implemented (circuit breakers remain per-domain).

---

## 9. Failover strategy

Primary unresolved / unconfigured → optional failover id for supported types (AI) → else console/local.

---

## 10. Migration plan

1. Deploy API + Admin UI.  
2. Existing env selectors remain defaults until Admin activates.  
3. Super Admin reviews each type; set None where unused.  
4. Document secrets in vault; keep examples updated.

---

## 11. Regression testing

| Case | Expect |
|------|--------|
| Activate OpenAI without key | Rejected with missing env |
| Activate None AI | Local knowledge assistants |
| Activate Resend with key | Email factory clears cache |
| Non–super-admin | 403 |
| Secrets in list API | Absent |

---

## 12. Production readiness

**Ready** for selection + discovery + audit logging.  
**Follow-ups:** wire SMS/Mapbox/S3 adapters; continuous health probes; wire `enableMockProviders` into factories; payment checkout UI for non-MoMo providers.
