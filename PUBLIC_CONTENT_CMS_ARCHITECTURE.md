# FixNow Public Content CMS Architecture

**Date:** 2026-07-24  
**Reference:** QuikCart (read-only) — typed legal/help content, draft→publish lifecycle, sanitization, TTL cache, dual delivery.  
**Constraint:** QuikCart was not modified. FixNow branding, routing, and Stitch Admin UX preserved.

---

## Summary

Admin Portal is the **single source of truth** for public FixNow content. Customer, Technician, Web, Android, and iOS load published pages from the API. Legal or help text changes do **not** require an app release.

---

## Architecture

```
Admin CMS (ContentPage)
  → contentService (sanitize, version, audit)
  → MongoDB ContentPage + AccountDeletionRequest
  → cache invalidate + socket content:updated
       ↓
Public API  GET /api/v1/public/content/:slug
       ↓
Customer / Technician / Capacitor apps
  → CmsDocumentView (fetch + localStorage offline cache + refresh)
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| Model | `ContentPage`, `AccountDeletionRequest` |
| Sanitize | HTML allowlist + Markdown→HTML |
| Service | CRUD, publish lifecycle, search, seed, deletion workflow |
| Cache | In-memory TTL (5 min) + explicit invalidation on publish |
| Realtime | `content:updated` to admin/customer/technician rooms |
| Admin UI | Existing AdminShell → Content Management |
| Apps | Dynamic `CmsDocumentView` + help/search + delete-account |

---

## Content model

Collection: `contentpages`

| Field | Purpose |
|-------|---------|
| `title` | Display title |
| `slug` | Unique with language (`privacy-policy`, `terms`, …) |
| `category` | `legal` \| `support` \| `public` \| `authentication` \| `account` \| `system` |
| `audience` | `all` \| `customer` \| `technician` \| `admin` |
| `bodyHtml` | Sanitized HTML (render target) |
| `bodyMarkdown` | Authoring source (optional) |
| `excerpt` | Short summary |
| `heroImageUrl` | Optional hero |
| `attachments[]` | Name/url/mime/size |
| `seoTitle` / `seoDescription` | SEO |
| `keywords[]` | Search tags |
| `language` | Default `en` |
| `status` | `draft` \| `published` \| `scheduled` \| `archived` |
| `version` | Monotonic revision number |
| `scheduledPublishAt` | Future publish |
| `publishedAt` / `publishedBy` | Publish metadata |
| `createdBy` / `updatedBy` | Actors |
| `revisionHistory[]` | Snapshots for restore |
| `isSystem` | Seeded canonical pages |
| soft-delete | `isDeleted` / `deletedAt` |

### Seeded slugs (published on boot)

Legal: `terms`, `privacy-policy`, `cookie-policy`, `refund-policy`, `community-guidelines`, `acceptable-use-policy`, `data-retention-policy`  

Support: `help`, `faq`, `contact-us`, `about`, `safety-tips`, `trust-verification`  

Public: `home`, `welcome`, `promo-banner`  

Auth: `login-welcome`, `register-intro`, `verification-instructions`, `forgot-password-instructions`, `account-recovery-help`  

Account: `delete-account`, `account-deletion-policy`, `data-export`, `user-rights`  

System: `maintenance`, `platform-announcements`, `release-notes`

---

## Admin workflow

1. Open **Admin → Content**
2. Filter/search by category, status, keywords
3. **Create / Edit** Markdown body + SEO + schedule
4. **Preview** sanitized HTML + revision list
5. **Publish / Unpublish / Archive / Duplicate / Restore / Delete**
6. **Seed defaults** (idempotent) if DB empty
7. **Process deletions** for due cooling-off requests

Publish increments `version`, writes audit log, clears public cache, emits `content:updated`.

Restore creates a **new draft** from history (QuikCart pattern).

---

## API endpoints

Base: `/api/v1`

### Public (no auth)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/public/content` | List published (`category`, `language`, `audience`) |
| GET | `/public/content/search?q=` | FAQ/policies/help search |
| GET | `/public/content/:slug` | Slug document (`privacy-policy`, `terms`, `help`, `about`, `delete-account`, `faq`, …) |
| GET | `/public/account/deletion-policy` | Structured deletion policy + confirm phrase |

### Admin (role: admin)

| Method | Path |
|--------|------|
| GET/POST | `/admin/content` |
| POST | `/admin/content/seed` |
| GET/PATCH/DELETE | `/admin/content/:id` |
| POST | `/admin/content/:id/publish\|unpublish\|archive\|restore\|duplicate` |
| GET | `/admin/account-deletions` |
| POST | `/admin/account-deletions/process` |

### Authenticated account deletion

| Method | Path |
|--------|------|
| GET | `/account/deletion` |
| POST | `/account/deletion` body `{ confirmPhrase, reason? }` |
| POST | `/account/deletion/cancel` |

Confirm phrase: `DELETE MY ACCOUNT`. Cooling-off: **48 hours**.

---

## Publishing lifecycle

```
draft → (optional scheduled) → published → unpublish→draft
                           ↘ archive
revisionHistory snapshots on update/publish/archive
restore → new draft document
```

Scheduled pages publish via CMS maintenance job (60s) and on public reads.

---

## Versioning

- Each mutation bumps `version`
- `revisionHistory` keeps last 50 snapshots
- Clients show version on document header
- Offline cache keyed by slug+language+audience; replaced on successful fetch / realtime event

---

## Caching

| Layer | Behavior |
|-------|----------|
| Server | In-memory Map, 5 min TTL for public get/search |
| Invalidation | On create/update/publish/unpublish/archive/delete/restore/duplicate |
| Client | `localStorage` via `writeContentCache` / `readContentCache` |
| Realtime | `SOCKET_EVENTS.CONTENT_UPDATED` clears cache key and refetches |

---

## Offline strategy (Web / Android / iOS)

Capacitor apps use the same React routes:

1. Show cached HTML immediately if present  
2. Fetch network when online  
3. Pull-to-refresh / Refresh button  
4. Offline banner when serving cache  
5. Native **Share** via `navigator.share`  
6. Deep links: `/customer/content/:slug`, `/technician/content/:slug`, `/customer/legal/:slug`  
7. Native back = existing React Router back controls  

No hardcoded legal bodies remain in Help pages.

---

## Security

- HTML sanitizer strips script/iframe/style/forms, event handlers, `javascript:` URLs  
- Markdown converted then sanitized before persist  
- Client display sanitizer (defense in depth)  
- Admin-only write routes + `authorize(ROLES.ADMIN)`  
- Audit log on every CMS mutation and deletion lifecycle event  
- Attachment URLs validated on write schema  
- Soft-delete for pages; account deletion anonymizes user + revokes sessions  

---

## Account deletion experience

1. Public CMS page `delete-account` explains deleted / retained / recovery / irreversible  
2. Authenticated workflow requests deletion with confirm phrase  
3. Status: `cooling_off` → `processing` → `completed` (or `cancelled`)  
4. Admin can list and process due requests  
5. Background job processes cooling-off expiry  

---

## App integration

| App | Integration |
|-----|-------------|
| Admin | `apps/admin/pages/ContentPage.tsx` full CMS |
| Customer | Help + `/content/:slug` + `/account/delete` |
| Technician | Help + `/content/:slug` + `/account/delete` |
| Shared | `CmsDocumentView`, content cache helpers |
| API package | `contentApi`, `accountDeletionApi` |

Auth screens can later bind copy to slugs `login-welcome`, `register-intro`, etc. without releases.

---

## Testing checklist

- [ ] Boot backend → defaults seeded/published  
- [ ] `GET /api/v1/public/content/privacy-policy` returns published HTML  
- [ ] Admin edit + publish updates customer Help without rebuild  
- [ ] Offline: load page, go offline, reopen → cached body  
- [ ] Online refresh / `content:updated` updates UI  
- [ ] Search FAQ returns CMS hits  
- [ ] Delete-account policy + request + cancel + process  
- [ ] Technician + customer deep links shareable  
- [ ] No hardcoded FAQ arrays remain in Help pages  

---

## Key files

- `backend/src/models/content/Content.ts`
- `backend/src/services/content/*`
- `backend/src/routes/index.ts` (public + admin CMS routes)
- `packages/api/contentApi.ts`
- `packages/shared/content/*`
- `apps/admin/pages/ContentPage.tsx`
- `apps/customer/pages/{HelpPage,ContentDocumentPage,DeleteAccountPage}.tsx`
- `apps/technician/pages/{HelpPage,ContentDocumentPage,DeleteAccountPage}.tsx`

---

## Design principles (from QuikCart, FixNow-adapted)

1. Admin-owned content, not app releases  
2. Draft → publish → archive with revision history  
3. Sanitize at write time  
4. Short TTL + explicit invalidation on publish  
5. JSON API for in-app + stable slug URLs for deep links  
6. Account deletion policy is CMS content driving both public info and workflow copy  
