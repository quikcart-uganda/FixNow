# Platform Domain Manager Audit

**Date:** 2026-07-28  
**Product:** FixNow  
**Scope:** Domains · URLs · environment · routing · OAuth · emails · deep links · payments · CDN · admin config  
**Stance:** Architecture audit + production design. **Domain Manager not shipped in this pass** — this document is the implementation contract.

**Inspiration:** QuikCart-style single primary domain with derived surfaces — FixNow must be **more flexible** (path-based SPA today + optional subdomain topology + per-surface overrides).

---

## Executive verdict

FixNow has **no centralized Platform Domain Manager**.

URLs are assembled from **many independent env vars**, plus **hardcoded App Link hosts** (`fixnow.app`, `fixnow.ug`) and email defaults (`noreply@fixnow.app`). The live product is a **single path-based SPA** (`/customer`, `/technician`, `/admin` on one origin). Deployment docs already hint at subdomain splits (`api.`, `admin.`, `app.`) that **code does not implement**.

| Ideal | Current |
|---|---|
| One primary domain → derive all portal/API/legal/asset URLs | Missing |
| Admin UI to preview / override | Missing |
| Env switch without code edits | Partial (many VITE_/CORS_/payment vars must stay in sync manually) |
| No hardcoded production hosts | Fail — App Links + email from + Capacitor hostname |
| Subdomain portals | Docs only; runtime is path prefixes |

**Production readiness for domain centralization: Not ready.**  
API/client resolution and LAN rewrite are solid for development; production domain changes are brittle and multi-file.

---

## 1. Current architecture

### 1.1 Topology (as implemented)

```
Browser / Capacitor WebView (one origin)
  └─ Vite SPA (base: './')
       /customer/*    customer portal
       /technician/*  technician portal
       /admin/*       admin portal (web only; blocked on native)
       /              landing / role select

API host (separate origin in production)
  └─ Express  {API_PREFIX}/api/v1
       CORS_ORIGINS allowlist
       /google-auth-bridge.html
       /webhooks/payments/:provider
```

**Not implemented:** `pro.fixnow.com`, `admin.fixnow.com`, `www.fixnow.com` as separate apps. Those are **aspirational labels** for a Domain Manager, not current DNS reality.

### 1.2 How URLs are resolved today

| Concern | Mechanism |
|---|---|
| Frontend → API | `VITE_API_URL` → `packages/api/resolveBaseUrl.ts` (+ LAN rewrite) |
| Socket | `VITE_SOCKET_URL` or strip `/api/v1` from API URL |
| CORS | `CORS_ORIGINS` comma list + non-prod LAN / Capacitor extras |
| Admin invite links | `ADMIN_FRONTEND_URL` ‖ first `CORS_ORIGINS` ‖ `http://localhost:5173` |
| OTP / password reset | **Code in email body — no absolute magic URL** |
| App Links / Universal Links | Hardcoded `APP_LINK_HOSTS` in `packages/native/deepLinks.ts` + Android/iOS project files |
| Capacitor WebView host | `app.fixnow.local` in `capacitor.config.ts` |
| Payment returns | Manual `FLUTTERWAVE_REDIRECT_URL`, `PESAPAL_CALLBACK_URL`, `MTN_MOMO_CALLBACK_HOST` |
| Push taps | Relative `href` (`/customer/...`) resolved client-side |
| Media CDN | Cloudinary cloud name / optional `VITE_MEDIA_BASE_URL` |

### 1.3 Key files

| Area | Path |
|---|---|
| Env schema | `backend/src/config/env.ts` |
| CORS | `backend/src/config/cors.ts` |
| Cookies | `backend/src/security/cookies.ts` (host-only; no `Domain=`) |
| API base resolve | `packages/api/resolveBaseUrl.ts` |
| Deep links | `packages/native/deepLinks.ts` |
| Admin invites | `backend/src/services/admin/adminIdentity.service.ts` |
| Email from | `backend/src/providers/email/*.ts` |
| Env examples | `.env.example`, `.env.development.example`, `.env.production.example` |
| Deploy guidance | `DEPLOYMENT.md` |
| PlatformSetting | Generic KV — free jobs / profile completion / dev controls only |

---

## 2. Hardcoded URLs found

### 2.1 Dangerous (runtime / ship-affecting)

| Value | Location | Impact |
|---|---|---|
| `fixnow.app`, `www.fixnow.app`, `app.fixnow.ug`, `fixnow.ug` | `packages/native/deepLinks.ts` → `APP_LINK_HOSTS` | Changing brand domain requires code + native rebuild |
| Same hosts (partial) | `android/.../AndroidManifest.xml`, iOS entitlements | Native App Links |
| `app.fixnow.local` | `capacitor.config.ts`; CORS non-prod allow | Must be listed in prod `CORS_ORIGINS` or API fails |
| `noreply@fixnow.app` | Resend/SMTP fallbacks | Brand email domain drift |
| `support@fixnow.app` | CMS seed / SMTP reply examples | Support copy |
| `http://localhost:4000(/api/v1)` | Client fallbacks if env missing | Dev-safe; prod misconfig risk |

### 2.2 Config / env (expected, but fragmented)

| Key | Role |
|---|---|
| `VITE_API_URL` / `VITE_SOCKET_URL` | Frontend API |
| `VITE_DEV_LAN_HOST` / `VITE_ANDROID_API_HOST` | LAN rewrite |
| `VITE_GOOGLE_AUTH_BRIDGE_ORIGIN` | GIS bridge |
| `VITE_MEDIA_BASE_URL` | Optional asset CDN (under-documented) |
| `CORS_ORIGINS` | Browser allowlist |
| `ADMIN_FRONTEND_URL` | Invite absolute links |
| `CAP_SERVER_URL` | Capacitor live reload |
| `FLUTTERWAVE_REDIRECT_URL` / `PESAPAL_CALLBACK_URL` / `MTN_MOMO_CALLBACK_HOST` | Payment callbacks |
| `EMAIL_FROM` / `SMTP_REPLY_TO` | Mail identity |
| Store URLs | `VITE_PLAY_STORE_URL`, `VITE_APP_STORE_URL`, … |
| `VITE_APP_DOWNLOAD_DEEP_LINK` | Default `fixnow://` |

### 2.3 Safe (third-party / docs / prototypes)

| Value | Notes |
|---|---|
| Google Maps / GIS / BigDataCloud | External APIs |
| Flutterwave / Stripe / MTN / Pesapal / Airtel bases | Payment vendors |
| `*.fixnow.example` in `DEPLOYMENT.md` | Placeholders |
| Stitch HTML CDNs | Design prototypes under `apps/*/reference/` |
| QuikCart paths | Docs only — not runtime |

### 2.4 Highest-risk mismatches

1. Domain change = edit **TS App Links + Android + iOS + CORS + VITE_* + payment callbacks + email defaults** with no single source of truth.  
2. `ADMIN_FRONTEND_URL` fallback to **first CORS origin** is wrong when CORS lists Capacitor / LAN first.  
3. Docs show multi-subdomain deploy; app is **one SPA origin**. Domain Manager must support both topologies.  
4. Production Capacitor origin must appear in `CORS_ORIGINS` explicitly (non-prod auto-allows `app.fixnow.local`).

---

## 3. Generated URL strategy

### 3.1 Primary field

```text
primaryDomain: "fixnow.com"     // hostname only, lowercase, no scheme, no trailing slash
useHttps: true                  // false allowed for localhost / LAN
topology: "path" | "subdomain"  // FixNow default today = path
```

**Validation**

- Hostname RFC-ish (labels, no spaces)  
- Allow `localhost` and private LAN IPs in non-production  
- Reject trailing `/`, `http://` prefix in primary field (scheme separate)  
- Reject duplicate hosts across generated surfaces after overrides  
- Sanitize: trim, lowercase host, strip path/query from primary

### 3.2 Surface catalog (extensible)

Each surface has: `id`, `label`, `defaultMode` (subdomain prefix **or** path), `override?`.

| Surface ID | Subdomain topology (aspirational) | Path topology (current FixNow) |
|---|---|---|
| `customer` | `https://{domain}/` or `https://app.{domain}` | `{webOrigin}/customer` |
| `technician` | `https://pro.{domain}` | `{webOrigin}/technician` |
| `admin` | `https://admin.{domain}` | `{webOrigin}/admin` |
| `www` | `https://www.{domain}` | `{webOrigin}/` (marketing) |
| `api` | `https://api.{domain}` | `{apiOrigin}` (always separate process) |
| `help` | `https://help.{domain}` | `{webOrigin}/customer/help` (or CMS) |
| `docs` | `https://docs.{domain}` | override or external |
| `status` | `https://status.{domain}` | override / status page |
| `legal` | `https://legal.{domain}` | `{webOrigin}/customer/content/...` |
| `assets` | `https://assets.{domain}` | Cloudinary / `VITE_MEDIA_BASE_URL` |
| `ai` | `https://ai.{domain}` | API AI routes or dedicated host |

**Custom prefixes:** admin can set `surfaces.technician.subdomainPrefix = "fundi"` → `https://fundi.fixnow.com`.

### 3.3 Derivation algorithm

```text
function resolveSurface(id):
  if override[id] → return normalize(override[id])
  if topology == subdomain:
    return `${scheme}://${prefix[id]}.${primaryDomain}${pathSuffix[id]?}`
  if topology == path:
    if id == api → return apiBaseOverride || env API
    return `${scheme}://${webHost}/${pathPrefix[id]}`
```

**Web host** for path mode: `webOrigin` override ‖ `www` ‖ apex `primaryDomain` ‖ env `CORS` first public origin.

### 3.4 Link builders (single module)

```text
platformUrls.absolute('customer', '/jobs/123')
platformUrls.absolute('technician', '/dashboard')
platformUrls.absolute('admin', '/accept-invite?token=…')
platformUrls.api('/auth/verify…')
platformUrls.deepLink('customer', '/tracking/123')  // fixnow:// or https App Link
platformUrls.emailFrom()  // noreply@{mailDomain}
```

All email, invite, invoice, QR, OG, sitemap, OAuth allowlist helpers call this module — **never** string-concat random origins.

### 3.5 Flexibility beyond QuikCart

| Capability | QuikCart-like | FixNow+ |
|---|---|---|
| Primary domain | ✓ | ✓ |
| Derived portals | ✓ | ✓ + path **or** subdomain topology |
| Per-URL overrides | ✓ | ✓ + custom subdomain prefixes |
| Env bootstrap | ✓ | Env seeds PlatformSetting; DB wins in prod admin UI |
| Native App Links | often fixed | Generated host list exported to build + runtime allowlist |
| Dev LAN / localhost | — | First-class: skip HTTPS, allow IP primary, preserve `resolveBaseUrl` rewrite |

---

## 4. Database changes

### PlatformSetting key

```text
key: platform.domains
value: {
  primaryDomain: string
  useHttps: boolean
  topology: 'path' | 'subdomain'
  webOrigin?: string              // path-mode apex (e.g. https://app.fixnow.com)
  apiOrigin?: string              // https://api.fixnow.com
  mailDomain?: string             // defaults to primaryDomain
  appLinkHosts?: string[]         // defaults derived
  appScheme?: string              // default 'fixnow'
  surfaces: {
    [id: string]: {
      enabled?: boolean
      subdomainPrefix?: string    // e.g. 'pro'
      pathPrefix?: string         // e.g. '/technician'
      overrideUrl?: string        // full origin or full URL base
    }
  }
  corsExtraOrigins?: string[]     // merged into effective CORS
  updatedAt, updatedBy
}
```

### Optional audit fields

- `validation: { ok, errors[], checkedAt }`  
- `sslNote: string` (informational only — FixNow does not terminate TLS)

Reuse existing `PlatformSetting` model (same pattern as `marketplace.free_jobs`).

---

## 5. Environment changes

### Bootstrap (still required for cold start)

| Env | Role after Domain Manager |
|---|---|
| `PLATFORM_PRIMARY_DOMAIN` | Seed primary (e.g. `fixnow.com` or `localhost`) |
| `PLATFORM_TOPOLOGY` | `path` \| `subdomain` |
| `PLATFORM_WEB_ORIGIN` | Path-mode web origin |
| `PLATFORM_API_ORIGIN` | API origin (mirrors today’s split) |
| `VITE_API_URL` / `VITE_SOCKET_URL` | Build-time client; can be derived in CI from primary |
| `CORS_ORIGINS` | **Generated at boot** from Domain Manager + extras; env becomes override/fallback |
| `ADMIN_FRONTEND_URL` | Deprecated → `platformUrls.absolute('admin')` |
| Payment callback envs | Prefer derived `{api}/api/v1/webhooks/...` + `{web}/customer/payments/...`; keep overrides |

### Development

```text
PLATFORM_PRIMARY_DOMAIN=localhost
PLATFORM_TOPOLOGY=path
PLATFORM_WEB_ORIGIN=http://localhost:5173
PLATFORM_API_ORIGIN=http://localhost:4000
useHttps=false
```

LAN: set `VITE_DEV_LAN_HOST` as today; Domain Manager must **not** break `rewriteDevLoopbackUrl`.

### Staging / Render preview

Set primary + web/api origins via env; no code change. Overrides for preview unique hosts.

---

## 6. Admin UI

### Page: Domain Management (`/admin/settings/domains`)

| Section | Content |
|---|---|
| Environment | `development` / `staging` / `production` (from env) |
| Primary domain | Input + validation status |
| Topology | Path vs Subdomain toggle + explanation of FixNow default |
| Generated URLs | Table of all surfaces with copy buttons |
| Overrides | Per-surface override fields |
| Preview | Sample invite / reset / profile / job / OG links **before save** |
| SSL | Informational checklist (DNS + cert tips) — not a live probe unless later |
| CORS effective list | Read-only derived allowlist |
| App Link hosts | Derived list + native rebuild reminder |
| Save | Writes PlatformSetting; audits `platform.domains.update` |

Reuse admin UI primitives (`PageHeader`, `Surface`, `FormError`) like Free Jobs / profile completion settings.

---

## 7. System integration map

| Consumer | Today | After |
|---|---|---|
| Admin invite email | `env.adminFrontendUrl` | `platformUrls.admin('/accept-invite?token=')` |
| OTP / reset | Code-only | Optional magic link using customer/admin surface |
| Push | Relative href | Keep relative **or** absolute App Link from manager |
| Deep links allowlist | Hardcoded array | Load from config / build-time generate |
| OAuth GIS bridge | `VITE_GOOGLE_AUTH_BRIDGE_ORIGIN` | Default `apiOrigin` |
| Payment redirects | Manual env | Derived + override |
| Footer / legal / CMS | Relative routes | Absolute when emailed / shared |
| SEO / OG / canonical / sitemap / robots | Missing | Generate from `www` + legal surfaces (phase 2) |
| Public technician / job URLs | Path-only | `platformUrls.customer('/technician/:id')` etc. |
| QR / invitations | Ad hoc | Always `platformUrls.*` |
| Cloudinary | Separate | `assets` override → media base |
| Maps | Google keys | Unchanged (third-party) |

---

## 8. Migration strategy

| Step | Action |
|---|---|
| 1 | Add `platformUrls` service + validators; seed from env on boot (`ensurePlatformDomainSetting`) |
| 2 | Replace `env.adminFrontendUrl` usages with `platformUrls` |
| 3 | Generate effective CORS from domains + `corsExtraOrigins`; keep env merge for safety |
| 4 | Admin Domain Management UI |
| 5 | Export `APP_LINK_HOSTS` from config module; keep native manifests in sync via doc/script (native still needs rebuild) |
| 6 | Document subdomain topology as **optional future**; default `path` matches current SPA |
| 7 | Deprecate scattered docs that imply subdomains without topology=subdomain |
| 8 | Payment callback defaults derived; leave explicit env overrides |

**No big-bang DNS change required** to ship the manager — path topology + current hosts as primary/overrides.

---

## 9. Security

| Control | Detail |
|---|---|
| Hostname validation | Reject `javascript:`, spaces, credentials, paths in primary |
| Override URL validation | Must be `http:`/`https:` absolute origin or base; block userinfo |
| Duplicate host detection | Warn/error if two surfaces resolve to same host unintentionally (configurable) |
| Admin-only writes | `authorize(ADMIN)` |
| Audit log | Who changed primary / overrides |
| Prod HTTPS | Require `useHttps=true` when `NODE_ENV=production` and host ≠ localhost |
| Open redirect | Link builders only emit known surfaces + safe relative paths |
| CORS | Never auto-add `*` |

---

## 10. Regression testing

| Case | Pass criteria |
|---|---|
| Generated URLs | Preview matches expected for path + subdomain fixtures |
| No critical hardcodes | App Links + invite + email from read from manager (native manifests documented) |
| OAuth | GIS + bridge still work with derived api origin |
| Emails | Invite link opens admin accept page |
| Notifications | Push opens correct portal path |
| Customer / Tech / Admin | Path topology routes resolve |
| Dev localhost + LAN | Vite + Capacitor Android still hit API |
| Staging override | API hosted elsewhere via override |
| Save validation | Malformed domain rejected |

*(Not executed in this audit pass — checklist for implementation.)*

---

## 11. Production readiness assessment

| Area | Ready? | Notes |
|---|---|---|
| Dev API URL resolution | **Yes** | `resolveBaseUrl` + LAN rewrite |
| Multi-portal path routing | **Yes** | Single SPA |
| Central domain config | **No** | Missing |
| Admin domain UI | **No** | Missing |
| Hardcoded App Links | **No** | Code + native |
| Email / invite absolute URLs | **Partial** | Only admin invite; fragile fallback |
| CORS as derived list | **No** | Manual comma string |
| Subdomain portals | **No** | Docs only |
| SEO/sitemap/robots | **No** | Not built |
| Payment URL derivation | **No** | Manual envs |

**Overall:** FixNow is operable with careful env discipline, but **not production-grade for domain lifecycle**. A Platform Domain Manager (path-default, subdomain-capable, override-friendly) is the right next infrastructure piece — more flexible than a QuikCart clone that assumes subdomains only.

---

## 12. Recommended implementation phases

| Phase | Scope |
|---|---|
| **D0** | `platform.domains` setting + `platformUrls` service + env seed + replace `adminFrontendUrl` |
| **D1** | Admin Domain Management page (preview, overrides, validation) |
| **D2** | Effective CORS from manager; document Capacitor origin |
| **D3** | Deep link host list from config; generation script for Android/iOS notes |
| **D4** | Payment / OG / legal absolute helpers; optional magic links |
| **D5** | Subdomain topology mode (only when DNS + separate deploys exist) |

---

## Appendix — Env inventory (URL-related)

**Frontend:** `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_DEV_LAN_HOST`, `VITE_ANDROID_API_HOST`, `VITE_GOOGLE_AUTH_BRIDGE_ORIGIN`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_MEDIA_BASE_URL`, store/download URLs, `CAP_SERVER_URL`.

**Backend:** `CORS_ORIGINS`, `ADMIN_FRONTEND_URL`, `API_PREFIX`, `HOST`, `PORT`, `EMAIL_FROM`, payment redirect/callback hosts, Cloudinary, Google client IDs (not redirect URIs).

**Absent today:** `APP_URL`, `FRONTEND_URL`, `PUBLIC_URL`, `PLATFORM_PRIMARY_DOMAIN`.

---

## Absolute answers

1. **Is there a domain manager today?** No.  
2. **Are portals on subdomains?** No — path prefixes on one SPA.  
3. **Can admins set one primary domain?** Not yet — design above enables it.  
4. **Will path topology keep working?** Yes — it is the **default** so development and current production deploys need no DNS redesign to adopt the manager.

**Await approval to implement Phases D0–D2.**
