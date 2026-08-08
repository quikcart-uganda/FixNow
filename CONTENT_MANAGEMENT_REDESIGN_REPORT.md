# Content Management Redesign Report

**Date:** 26 July 2026  
**Objective:** Make FixNow Admin Content Management feel like a professional enterprise CMS without rewriting working backend APIs or losing existing content.

---

## Existing architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Admin CMS UI    │────▶│ contentApi       │────▶│ ContentPage     │
│ /admin/content  │     │ /admin/content*  │     │ (Mongo)         │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                         ┌──────────────────┐             │
                         │ /public/content  │◀────────────┘
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       Customer apps        Technician apps      Legal / Help views
       (CmsDocumentView)    (useCmsCopy)         (public slugs)

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Marketing hub   │────▶│ marketingApi +   │────▶│ PlatformPromo / │
│ /admin/marketing│     │ contentBlocksApi │     │ Sponsored /     │
└─────────────────┘     └──────────────────┘     │ ContentBlock    │
                                                  └────────┬────────┘
                                                           │
                                                    Delivery APIs → Apps

┌─────────────────┐     ┌──────────────────┐
│ Uploads         │────▶│ Storage adapter  │──▶ Cloudinary / local
│ POST /uploads   │     │ Upload model     │
└─────────────────┘     └──────────────────┘
```

| Content type | Storage | Admin surface | Consumers |
|---|---|---|---|
| Legal / help / auth pages | `ContentPage` | Content CMS | Public content API, CmsDocumentView |
| Dynamic homepage / app sections | `ContentBlock` | Marketing → Dynamic Content | useContentBlocks |
| Platform promotions / ads | Marketing models | Marketing workspaces | marketing delivery APIs |
| Technician offers | Offer model | Offer moderation | Customer offer rails |
| Push announcements | Notification services | Notification Center | Devices |

**Backend APIs were not rewritten.** Publish, unpublish, archive, restore, duplicate, seed, and hero image fields already existed and are reused.

---

## Problems discovered

| Problem | Severity | Resolution |
|---|---|---|
| Single flat “Content” page mixed legal, help, and public pages with technical columns (slug, version, raw enums) | P0 | Workspace separation + article cards |
| Scattered action buttons | P0 | `OverflowMenu` actions |
| Editor was a basic modal with markdown only — weak preview | P0 | Split editor + live multi-device preview |
| No image upload path in CMS UI | P0 | Media Library + drag/drop via `/uploads` |
| No visual icon picker for CMS | P1 | `ContentIconPicker` catalogue |
| Notifications exposed `JSON.stringify` stats | P0 | Business KPI cards |
| Marketing lived separately without CMS guidance | P1 | Marketing workspace hub with deep links |
| Administrators saw implementation language | P1 | Human labels for category / audience / status |

---

## Content flow diagram

```
Administrator
    │
    ├─ Knowledge Base / Legal / CX / TX articles
    │      → contentApi.create|update|publish
    │      → ContentPage (DB)
    │      → /public/content/:slug
    │      → Customer & Technician apps
    │
    ├─ Marketing Content workspace
    │      → existing Marketing routes (unchanged APIs)
    │      → promotions / ads / content-blocks / offers
    │
    └─ Media Library
           → POST /uploads
           → heroImageUrl / banners reused across CMS
```

Nothing in the redesigned CMS requires editing frontend code to publish business content.

---

## New CMS layout

**Workspaces (tabs)**

1. **Knowledge Base** — help / public articles  
2. **Legal** — privacy, terms, escrow, account policies  
3. **Customer Experience** — customer-facing pages + links to dynamic sections & notifications  
4. **Technician Experience** — technician-facing pages + same operational links  
5. **Marketing Content** — hub cards into existing Marketing modules  
6. **Media Library** — upload, folders, reuse  

**Article cards show**

- Thumbnail (hero or branded placeholder)  
- Title, category, audience, status  
- Last edited, publish date, author (Administrator / System), revision  
- Primary Edit / Preview + **⋯** menu: Open, Publish/Unpublish, Duplicate, Archive, Restore, Version history, Move, Delete  

**Editor (left / right)**

- Left: title, optional web address, category, audience, tags, summary, content, featured image, icon picker, CTA, display location, schedule, search metadata  
- Right: **Live preview** with Desktop / Customer app / Technician app / Tablet / Mobile / Banner / Card / Popup / Notification  

---

## Preview implementation

`LivePreview` renders the draft from markdown (client preview helper) or saved `bodyHtml` (sanitized). Device chrome frames help admins see customer vs technician presentation. Banner / card / popup / notification modes show placement-style previews without changing storage.

---

## Media management

`MediaLibrary` component:

- Drag & drop + file picker  
- PNG / JPG / WEBP / SVG via existing `POST /uploads`  
- Folders: Marketing, Categories, Technicians, Articles, Banners, Legal, Education, Uploads, Icons  
- Recently uploaded (session) + hero images pulled from existing content pages  
- Alt text field, select / replace / remove  
- Crop / remove-background marked future-ready (not invented client-side)

---

## Icon management

`ContentIconPicker` — visual Material Symbols catalogue grouped by Electrical, Plumbing, Cleaning, Security, Construction, Garden, Emergency, Business, Payments, Notifications, Verification, Marketing. Administrators click glyphs; no typing of icon names required. Compatible with existing `Icon` component.

---

## Removed user-facing technical content

| Before | After |
|---|---|
| Table columns: Slug, Ver, raw `legal` / `draft` | Cards with “Legal”, “Draft”, “Rev N” |
| Notification `JSON.stringify({ sent: 11 })` | Delivered / Queued / Failed / Processing breakdown |
| “Seed defaults” database language | “Restore defaults” |
| Scattered Edit/Publish/… buttons | Overflow menu |

IDs and raw API payloads are not shown in administrator views.

---

## Hardcoded frontend business content

Audit result for admin CMS path:

- **Content pages** — backend `ContentPage` + seed (admin-triggered restore only)  
- **Marketing** — backend marketing / content-block APIs (unchanged)  
- **No new hard-coded articles** introduced in the CMS redesign  
- Form option lists are schema enums with **human labels** (not business copy)

App-facing hardcoding outside this CMS remains a follow-up for customer/technician home rails if any static promo strings still exist; admin-managed paths are the intended source of truth.

---

## Files modified / added

```
apps/admin/pages/ContentPage.tsx                    (redesigned CMS)
apps/admin/pages/NotificationsPage.tsx              (business stats UI)
apps/admin/components/cms/labels.ts                 (new)
apps/admin/components/cms/previewHtml.ts            (new)
apps/admin/components/cms/ContentIconPicker.tsx     (new)
apps/admin/components/cms/MediaLibrary.tsx          (new)
apps/admin/components/cms/LivePreview.tsx           (new)
CONTENT_MANAGEMENT_REDESIGN_REPORT.md               (this file)
```

**Reused:** `contentApi` (full lifecycle), `OverflowMenu`, `LazyImage`, `resolveMediaUrl`, `sanitizeContentHtml`, `POST /uploads`, Marketing routes, ContentBlock / marketing APIs (linked, not rewritten).

---

## Regression testing

| Check | Result |
|---|---|
| Content categories separated into workspaces | Pass |
| Technician / customer / marketing / legal independent entry points | Pass |
| Article cards + overflow actions | Pass |
| Preview modes functional | Pass |
| Image upload via existing upload API | Pass |
| SVG/PNG/JPG/WEBP accepted in media picker | Pass |
| Icon picker visual selection | Pass |
| Backend content APIs untouched | Pass |
| Existing content list/edit/publish preserved | Pass |
| No raw JSON in Notification Center | Pass |
| No new hard-coded business articles | Pass |

---

## Production readiness assessment

**Ready for staged admin rollout.**

**Strengths**

- Zero backend API rewrites; existing content and seed remain intact  
- Clear workspace mental model for first-time administrators  
- Live preview + media + icons close the largest UX gaps  

**Follow-ups (non-blocking)**

1. Persist media library folders server-side (Upload query/list endpoint) instead of session + hero scrape  
2. Wire CTA / display-location / icon into Content model fields if product wants those persisted (today CTA/icon aid preview; `heroImageUrl` / body / metadata persist)  
3. Image crop UI and remove-background when a processing provider is chosen  
4. Sweep customer/technician home for any remaining static promo strings and migrate to content-blocks  

**Verdict:** The Administration Content Management experience now behaves like an enterprise CMS while remaining production-safe against the existing content stack.

---

## Phase 13 — Cross-platform responsiveness & mobile parity

### Responsive fixes applied

| Surface | Change |
|---|---|
| CMS editor | Full-viewport on mobile with safe-area insets; **Edit / Preview** tabs below `lg`; side-by-side from `lg+` |
| CMS preview / versions | `100dvh` shells, bottom-sheet style on small screens, no clipped dialogs |
| Live preview | Horizontal chip scroller (no page overflow); `min-w-0` / `break-words`; device frames capped to container |
| Media library | Touch targets, gallery-friendly file input, folder chip scroller, adaptive grids |
| Icon picker | Larger touch cells, 3→6 column adaptive grid |
| Marketing tabs / CMS workspaces | Scrollable chip rows with overscroll containment |
| Verification queue rows | `min-w-0`, tighter mobile padding |
| `CmsDocumentView` (shared) | `LazyImage` + `resolveMediaUrl` for heroes; prose won't force horizontal scroll |

### Publishing pipeline (validated by architecture)

```
Admin UI (Content / Marketing / Notifications / Categories)
        ↓
Backend API (contentApi, marketingApi, contentBlocksApi, uploads, notifications)
        ↓
Database (+ content cache invalidate on publish)
        ↓
Shared clients (same packages for web + Capacitor)
        ↓
Customer Web / Android / iOS
Technician Web / Android / iOS
```

**Parity evidence (code):**

| Admin publishes… | Consumer hook / API | Customer | Technician |
|---|---|---|---|
| CMS article / legal / help | `contentApi.getPublic` · `CmsDocumentView` | Help, legal, ContentDocumentPage | Help, legal, ContentDocumentPage |
| Dynamic content blocks | `useContentBlocks` | Splash, onboarding, register | Splash, onboarding, dashboard tips |
| Promotions / ads / campaigns | `marketingApi.deliverCustomer` / `deliverTechnician` · `MarketingRails` | Home | Dashboard |
| Category images | Categories API | Booking / browse flows | Job categories |
| Notifications / broadcasts | Push + in-app notification APIs | Devices registered to customer role | Devices registered to technician role |

Capacitor apps load the same Vite web bundles as Customer/Technician web — no separate content frontend. Sync is therefore automatic when apps call the same APIs (with existing content cache + realtime invalidation).

### Capacitor compatibility notes

| Concern | Status |
|---|---|
| Touch targets (≥44px) on CMS controls | ✓ |
| Scrolling (`overscroll-contain`, `100dvh`) | ✓ |
| Dialogs / sheets (safe-area aware) | ✓ |
| File upload / gallery (`input type=file` accept images) | ✓ (camera capture optional follow-up via Capacitor Camera plugin where product requires it) |
| Image previews (`LazyImage`) | ✓ |
| Safe area insets on overlays | ✓ |
| Shared content components in native shells | ✓ |

### Compatibility matrix

Legend: ✓ Fully Supported · ⚠ Partial · ✗ Missing

| Feature | Desktop Web | Mobile Web | Android (Capacitor) | iOS (Capacitor) |
|---|---|---|---|---|
| CMS workspaces & article cards | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| CMS editor + live preview | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Media upload / library | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Icon picker | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Overflow action menus | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Marketing workspace | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Verification workspace | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Lock management | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Notification stats (non-JSON) | ✓ | ✓ | ✓ Admin web* | ✓ Admin web* |
| Published CMS articles in apps | ✓ | ✓ | ✓ | ✓ |
| Marketing delivery rails | ✓ | ✓ | ✓ | ✓ |
| Dynamic content blocks | ✓ | ✓ | ✓ | ✓ |
| Help / legal documents | ✓ | ✓ | ✓ | ✓ |
| Category / banner media | ✓ | ✓ | ✓ | ✓ |
| Native camera capture for CMS upload | ⚠ N/A | ⚠ Gallery file picker | ⚠ Gallery via file input | ⚠ Gallery via file input |

\*Admin Command Center is a web application (desktop/tablet/mobile browser). Capacitor Customer/Technician shells consume the **published** content; they do not host the Admin CMS UI.

### Regression checklist

| Check | Result |
|---|---|
| No clipped CMS dialogs on small viewports | Pass |
| No horizontal page scroll from preview chips / folders | Pass |
| Forms usable at 16px mobile text size | Pass |
| Desktop retains split editor + wide card grids | Pass |
| Shared `CmsDocumentView` safe for Capacitor | Pass |
| Backend APIs unchanged / backwards compatible | Pass |
| No duplicated content clients | Pass |

**Phase 13 verdict:** Responsive and cross-client content parity is production-ready for Admin web + Customer/Technician web/Android/iOS consumption paths. Native camera plugin for CMS uploads remains optional polish, not a content-sync blocker.

