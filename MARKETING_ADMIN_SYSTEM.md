# Marketing Admin System

**Status:** Implemented  
**UX rule:** Extends the existing Admin Stitch shell — no redesign of tokens, layout, or nav chrome.

---

## 1. Architecture

```text
Admin Marketing module (/admin/marketing)
├── Analytics (platform-wide)
├── Pending / Approved / Rejected Offers  → TechnicianOffer moderation
├── Platform Promotions                  → PlatformPromotion (admin-owned)
├── Sponsored Campaigns                  → SponsoredContent
├── Advertisements                       → SponsoredContent (partner_ad)
└── Categories                           → deep-link to marketplace Categories

Backend
├── models/growth/Offer.ts               Technician offers
├── models/growth/Marketing.ts           PlatformPromotion + SponsoredContent
├── services/marketing/offer.service.ts  Moderation + notifications
└── services/marketing/marketing.service.ts  Platform promo / sponsored / analytics
```

**Hard rule:** Technician offers stay private until Admin approves them and the schedule window is live.

---

## 2. Approval workflow (technician offers)

```text
Draft → Pending → Approve → Scheduled / Active
                ↘ Reject → Rejected (edit & resubmit)
Active/Scheduled → Suspend / Archive / Expire / Unfeature
Any              → Duplicate (creates Draft copy) / Delete (soft)
```

### Admin actions

| Action | Effect | Audit | Technician notify |
|--------|--------|-------|-------------------|
| Preview | Customer-facing card + notes | — | — |
| Approve | Live/scheduled; favourite + nearby customer alerts | `offer.approved` | Yes |
| Reject | Rejected + reason | `offer.rejected` | Yes |
| Suspend | Archived + reason | `offer.suspended` | Yes |
| Archive | Archived | `offer.archived` | Yes |
| Feature / Unfeature | `featured` flag | `offer.featured` / `unfeatured` | Feature yes |
| Expire | Force expired now | `offer.expired` | Yes |
| Duplicate | New draft clone | `offer.duplicated` | — |
| Delete | Soft-delete | `offer.deleted` | — |

UI: side-by-side customer preview, review comments, one-click actions, lifecycle audit trail (`OffersModerationPage`).

---

## 3. Platform promotions

Admin-owned campaigns (not technician inventory):

- Holiday Campaign  
- Welcome Discount  
- Referral Rewards  
- Seasonal Campaigns  
- Platform Announcements  
- Custom  

Model: `PlatformPromotion` — kind, creative, optional code, discount, audience, schedule, featured, analytics.

APIs under `/admin/marketing/platform-promotions`.

Publishing can fan-out `marketing.featured_campaign` notifications to customers.

---

## 4. Sponsored content & advertisements

`SponsoredContent` types:

- Educational banners  
- Safety campaigns  
- Tips  
- Partner advertisements  
- Announcements  
- Community notices  

Placements: `home | offers | search | profile | global`.

Advertisements admin view filters `partner_ad`.

---

## 5. Analytics

`GET /admin/marketing/analytics`

Platform-wide:

- Live / pending offers, platform promos, sponsored active  
- Views, clicks, redemptions, revenue  
- CTR, conversion, customer engagement  
- Most viewed, most redeemed  
- Top technicians by bookings / revenue  

---

## 6. Notifications

| Audience | Event | Type |
|----------|-------|------|
| Technician | Approved / rejected / suspended / archived / featured / expired | `offer.*` |
| Customer | Favourite technician published | `offer.favourite_technician` |
| Customer | Nearby promotion (capped fan-out) | `offer.nearby` |
| Customer | Saved offer expiring ≤24h | `offer.expiry_reminder` |
| Customer | Featured platform campaign | `marketing.featured_campaign` |

All via `createDbNotification` (in-app + push prefs).

---

## 7. APIs

### Offers (admin)

| Method | Path |
|--------|------|
| GET | `/admin/offers?lifecycle=` |
| POST | `/admin/offers/:id/moderate` `{ action, reason? }` |
| POST | `/admin/offers/:id/duplicate` |

Actions: `approve|reject|archive|suspend|feature|unfeature|expire|delete`

### Marketing

| Method | Path |
|--------|------|
| GET | `/admin/marketing/analytics` |
| CRUD | `/admin/marketing/platform-promotions` |
| POST | `/admin/marketing/platform-promotions/:id/status` |
| CRUD | `/admin/marketing/sponsored` |
| POST | `/admin/marketing/sponsored/:id/status` |

Client: `packages/api/marketingApi.ts` + extended `offersApi`.

---

## 8. Permissions

- All marketing admin routes: `authenticate` + `authorize(ADMIN)`  
- Technician create/edit/submit: technician role only  
- Customer visibility: public filters only (`isCustomerVisible`)  
- Audit: `writeAuditLog` on create/update/moderate/status/delete  

---

## 9. Premium technician UX (already in Marketing module)

Documented product expectations satisfied by existing technician marketing surfaces:

- Dashboard metrics + conversion funnel + quick actions (create / duplicate / boost)  
- Multi-step Offer Builder with live customer preview, banner upload, rich text, draft/resume  
- Scheduling, targeting, redemption limits, expiry countdown  
- Analytics + performance suggestions  

Admin review complements this with preview, comments, feature/suspend/archive/reject, and audit trail.

---

## 10. Testing checklist

1. Pending offer never appears on `/offers/public` until approved + live window.  
2. Approve → technician notified; favourite customers notified.  
3. Reject with comment → technician sees reason.  
4. Feature / expire / duplicate / delete behave as table above + audit log rows.  
5. Create platform Holiday promotion → appears in Platform Promotions list; status transitions work.  
6. Create safety campaign + partner ad → Campaigns vs Ads tabs.  
7. Analytics totals move when offers accumulate views/clicks/bookings.  
8. Non-admin JWT cannot call `/admin/marketing/*`.  

---

## 11. Admin navigation

**Marketing** (`/admin/marketing`) under Overview, with sub-routes for queues, platform promos, campaigns, ads, categories, analytics. Legacy `/admin/offers` redirects to `/admin/marketing/pending`.
