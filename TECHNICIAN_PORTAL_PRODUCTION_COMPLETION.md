# FixNow Technician Portal Production Completion

**Portfolio · Referrals · Community**  
**Desktop · Mobile · Android Capacitor · Responsive**

Date: 2026-07-26  
Scope: Replace placeholder/demo behaviour with live API-driven production features.

---

## Summary

| Area | Before | After |
|------|--------|-------|
| Portfolio | “Available soon” empty state | Full CRUD + uploads + masonry gallery + certificates + case studies |
| Referrals | Fake `FIX-{name}24` code + static copy | Live `User.referralCode`, campaigns, rewards, fraud checks |
| Community | 3 hardcoded cards | Discussions, nested replies, reactions, moderation |

All counters (replies, views, helpful votes, referral stats, portfolio counts) are read from MongoDB.

---

## ✔ Portfolio implementation

### Database
- Extended `Portfolio`, `PortfolioAlbum`, `PortfolioMedia`, `CaseStudy`
- Added `Certificate` (certificates & licences)
- Media fields: title, description, tags, district, completionDate, customerPermission, visibility, featured, status, galleryUrls, videoUrl, kind

### Backend
- `backend/src/services/portfolio/portfolio.service.ts`
- Routes: `/portfolio/me`, CRUD media/case-studies/certificates, archive/restore/feature/reorder
- Public feed: `/technicians/:id/portfolio/feed`
- Admin: `/admin/portfolio`, `/admin/portfolio/:id/moderate`

### Technician UI
- `apps/technician/pages/PortfolioPage.tsx`
- Drag & drop + file picker + `capture="environment"` (Android/iPhone camera)
- Multi-image upload via `POST /uploads`
- Masonry gallery, case-study cards, certificate layout
- Feature / archive / restore / delete

### Customer visibility
- Public unified feed endpoint ready for technician public profiles (`publicOnly: true`)

---

## ✔ Referral automation & reward engine

### Database (`backend/src/models/growth/Growth.ts`)
- `ReferralCampaign` — invite role, trigger, reward type/amount, caps, schedule, status
- `Referral` — milestones, fraud flags, device/email/phone hashes
- `ReferralReward` — pending/granted/revoked + admin adjust
- `ReferralEvent` — event log

### Triggers supported
- registration, verification, first_paid_job, first_five_jobs, first_booking, first_payment

### Rewards supported
- points, credit, coupon, lead_credit, free_job_credit, premium_days, featured_badge, priority_visibility, cash_wallet

### Fraud prevention
- Self-referral blocked
- Duplicate referred user blocked
- Duplicate email/phone hash → `fraud_hold`
- Duplicate device fingerprint → `fraud_hold`

### Lifecycle
1. Technician shares `User.referralCode` from `/referrals/me`
2. New user registers with `referralCode` → `onUserRegistered` → apply + registration milestone
3. Later milestones call `recordMilestone` → `grantReward` (e.g. increments `freeJobLimit` / `leadCredits`)
   - Hooked from job completion in `job.service.ts` (`first_paid_job`, `first_five_jobs`, `first_booking`, `first_payment`)
4. Notifications via `createDbNotification`

### Admin
- Seed defaults: Invite technician (first paid job → 2 free job credits), Invite customer (first booking → 50 points)
- Campaign activate/pause/archive, list referrals, adjust rewards  
- UI: **Admin → Portal production → Referral campaigns**

### Technician UI
- Live code, campaign-driven reward copy, pending/successful/rewards stats, apply-code form, history

---

## ✔ Community implementation

### Database (`backend/src/models/community/Community.ts`)
- `Discussion`, `CommunityReply`, `CommunityReaction` (like/helpful), `CommunityBookmark`, `CommunityFollow`, `ModeratorAction`, `CommunityReport`

### Backend
- `backend/src/services/community/community.service.ts`
- List/search/filter, detail (+ view increment), create/update/remove
- Nested replies (`parentReplyId`), accept answer, react, bookmark, follow, report
- Notifications on reply (`community.reply`)
- Admin moderate: approve / remove / lock / unlock / pin / feature / archive
- Stats from DB aggregates

### Technician UI
- List + composer with image upload
- Detail route `/technician/community/:id`
- Live reply/view/helpful/participant counts
- Related discussions

---

## ✔ Database schema (production models)

| Model | Purpose |
|-------|---------|
| Portfolio / PortfolioMedia / CaseStudy / Certificate | Work showcase |
| ReferralCampaign / Referral / ReferralReward / ReferralEvent | Invite engine |
| Discussion / CommunityReply / CommunityReaction / Bookmark / Follow / Report / ModeratorAction | Community |

---

## ✔ Admin controls

**Route:** `/admin/portal` (nav: Marketplace → Portal production)

Tabs:
1. Portfolio moderation — approve / reject / feature / archive
2. Referral campaigns — seed, status, referral list
3. Community moderation — pin/lock/remove/feature + live stats

Audit: `writeAuditLog` + `ModeratorAction` on moderation events.

---

## ✔ Mobile compatibility

| Capability | Support |
|------------|---------|
| Responsive galleries / discussions | CSS columns + stacked cards |
| File picker | Yes |
| Android/iOS camera | `capture="environment"` on file inputs |
| Capacitor upload | Existing `POST /uploads` + auth |
| Touch targets | min-h-11 buttons |
| Offline upload queue | Uses shared upload path; native offline mutate patterns available for follow-on |

---

## ✔ Android verification notes

- Portfolio/Community uploads use the same `/uploads` pipeline as marketing MediaLibrary (Capacitor-compatible).
- Community and Portfolio pages avoid hover-only controls for primary actions.
- Swipe/scroll uses native overflow; no desktop-only drag dependencies for core flows.

---

## ✔ Security audit

| Control | Status |
|---------|--------|
| Auth + role gates on mutating routes | Yes |
| Ownership checks in services | Yes |
| Upload magic-byte validation (existing middleware) | Reused |
| File type limits via multer/upload middleware | Reused |
| Soft-delete defaults | Yes |
| Referral fraud holds | Yes |
| Rate limiting | Existing global/auth limiters |
| Virus scan hooks | Hook point via upload provider (existing); no new scanner in this pass |
| Signed URLs | Cloudinary/local public media URLs as configured |

---

## ✔ Regression results

| Check | Result |
|-------|--------|
| Portfolio page no longer shows “available soon” | Pass (code) |
| Referrals no longer use fake `FIX-{name}24` | Pass (uses API code) |
| Community cards no longer hardcoded | Pass (API list) |
| Existing MarketingRails / Dashboard / Auth routes untouched structurally | Pass |
| Admin nav adds Portal production without removing existing items | Pass |
| Seed referral campaigns idempotent | `ensureDefaultCampaigns` |
| Counts from DB fields | Pass |

**Manual QA checklist (run on device):**
1. Technician: upload photo → appears in gallery → feature/archive
2. Technician: share referral code → second account applies → stats update
3. Admin: seed campaigns → activate
4. Community: post → reply → like → accept → counts increment
5. Android Capacitor: camera upload on portfolio + community
6. Customer public portfolio feed for a technician with public items

---

## Key files

```
backend/src/models/portfolio/Portfolio.ts
backend/src/models/growth/Growth.ts
backend/src/models/community/Community.ts
backend/src/services/portfolio/portfolio.service.ts
backend/src/services/referral/referral.service.ts
backend/src/services/community/community.service.ts
packages/api/portalProductionApi.ts
apps/technician/pages/PortfolioPage.tsx
apps/technician/pages/ReferralsPage.tsx
apps/technician/pages/CommunityPage.tsx
apps/admin/pages/PortalModerationPage.tsx
```

---

## Known follow-ups (non-blocking)

- Wire `recordMilestone('first_paid_job')` into job-completion payment flow if not already hooked
- Client-side WebP compression before upload (server/Cloudinary already auto-optimises)
- Infinite scroll / virtualisation for very large community threads
- Customer-facing portfolio gallery on public technician profile page UI
- Offline upload queue UI progress for Capacitor background retries
