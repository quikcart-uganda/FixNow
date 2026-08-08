# FixNow Database Architecture

**Database name:** `FixNow`  
**Engine:** MongoDB + Mongoose (TypeScript)  
**Consumers:** Customer, Technician, and Admin apps — one shared backend, one shared database.

This document describes the **data layer only**. Controllers, services, and auth business logic are intentionally unimplemented; HTTP domain routes continue to return `501 NOT_IMPLEMENTED`.

---

## 1. Design principles

| Principle | Application |
|-----------|-------------|
| One identity | `User` is the single auth identity; role-specific data lives in profile collections |
| Normalize by default | Addresses, applications, messages, media, permissions are separate collections |
| Denormalize for read hot paths | Job category names, technician trust scores, conversation last-message preview |
| Soft delete everywhere | `isDeleted` + `deletedAt` via shared plugin; default queries exclude deleted rows |
| Uganda-first geo | `UgandaLocation` (country → village) + GeoJSON `Point` for GPS / 2dsphere |
| Future-ready | Subscriptions, escrow, leads, spare parts, academy, contracts, coupons, AI already modeled |
| Pagination-ready | Consistent `createdAt` indexes and compound `(status, createdAt)` patterns |

---

## 2. Folder layout

```
backend/src/models/
  shared/          # soft-delete plugin, geo, Uganda location, domain enums
  auth/            # User, RefreshToken, Session
  customer/        # CustomerProfile, CustomerAddress, SavedTechnician
  technician/      # Profile, Service, Availability, CoverageArea, WorkingHours
  admin/           # AdminUser, AdminRole, Permission
  marketplace/     # Category, Subcategory, Job, JobAttachment, JobApplication, Assignment
  communication/   # Conversation, Participant, Message, Attachment, Notification*
  trust/           # TrustScore, Reputation, Badge, Achievement, UserAchievement
  verification/    # Identity, Skill, Certification
  portfolio/       # Portfolio, Album, Media, CaseStudy
  reviews/         # Review, Rating
  safety/          # VisitVerification, EmergencyContact, LiveTrackingSession
  payments/        # Wallet, MobileMoneyAccount, Transaction, EscrowTransaction
  growth/          # Referral, ReferralReward, Promotion
  analytics/       # DailyMetric, UserActivity, SearchAnalytics
  platform/        # AuditLog, PlatformSetting
  future/          # Subscriptions, leads, marketplace listings, academy, contracts, AI, Upload
  index.ts         # barrel export
```

Connection forces `dbName: 'FixNow'` in `config/database.ts` and registers all models on boot.

---

## 3. ERD (text)

```
User 1──1 CustomerProfile 1──* CustomerAddress
User 1──* SavedTechnician *──1 TechnicianProfile
User 1──1 TechnicianProfile 1──* TechnicianService
                           1──* CoverageArea
                           1──* WorkingHours
                           1──1 TechnicianAvailability
                           1──1 TrustScore
                           1──1 Portfolio 1──* PortfolioAlbum 1──* PortfolioMedia
                                         └──* CaseStudy
User 1──1 AdminUser *──1 AdminRole *──* Permission
User 1──* RefreshToken / Session
User 1──1 Wallet 1──* Transaction
User 1──* MobileMoneyAccount
User 1──1 NotificationPreference
User 1──* Notification
User 1──* EmergencyContact

Category 1──* Subcategory
Customer(User) 1──* Job *──1 Category/Subcategory
Job 1──* JobAttachment
Job 1──* JobApplication *──1 Technician(User)
Job 1──1 Assignment *──1 Technician(User)
Job 1──0..1 Review 1──0..1 Rating
Job 1──* VisitVerification / LiveTrackingSession / EscrowTransaction

Conversation 1──* ConversationParticipant *──1 User
Conversation 1──* Message 1──* MessageAttachment
Conversation 0..1── Job

Referral 1──* ReferralReward
Promotion / Coupon / LoyaltyLedger / Subscription / LeadPurchase (future growth & monetization)
HardwarePartner / MarketplaceListing / AcademyCourse / ServiceContract / AiRecommendation
DailyMetric / UserActivity / SearchAnalytics / AuditLog / PlatformSetting
```

---

## 4. Relationship explanation

### Identity & roles
- **User** holds email/phone/password hash, role, account lock, referral code, loyalty points, subscription-ready fields.
- **CustomerProfile / TechnicianProfile / AdminUser** are 1:1 extensions — avoids wide polymorphic user documents.
- **RefreshToken** + **Session** support rotatable refresh families and device sessions (TTL on `expiresAt`).

### Marketplace core
- **Job** is the aggregate root for the service marketplace lifecycle (`draft` → `posted` → … → `archived`).
- Embedded **statusHistory** and **timeline** capture auditability without joining event tables for every UI read.
- **JobApplication** is unique per `(jobId, technicianId)`.
- **Assignment** is 1:1 with an active job engagement once a technician is selected.
- Media lives in **JobAttachment** (normalized) with denormalized `photoUrls`/`videoUrls` on Job for cards.

### Trust & reputation
- **TrustScore** is the source of truth for trust dimensions; TechnicianProfile stores denormalized copies for sorting/filtering at scale.
- **Review** (narrative) and **Rating** (dimensional scores) are separate so moderation can hide comments without losing metrics.
- **Badge / Achievement / UserAchievement** power reputation UX without bloating profiles.

### Communication
- Participants are normalized (**ConversationParticipant**) for unread counts and mute state; Conversation keeps `participantUserIds` + last-message preview for inbox lists.

### Payments (future-ready)
- **Wallet** ledger + **Transaction** immutable-style rows; **EscrowTransaction** links to jobs for hold/release/dispute.
- **MobileMoneyAccount** supports MTN and Airtel with verified MSISDNs.

### Localization
- Shared **UgandaLocation** + **GeoPoint** used on profiles, addresses, jobs, coverage, and tracking.

---

## 5. Job status machine (data contract)

```
draft → posted → assigned → technician_en_route → in_progress
      → awaiting_confirmation → completed
任意 → cancelled | disputed | archived
```

Stored on `Job.status` with append-only `statusHistory[]`.

---

## 6. Index strategy

| Domain | Indexes | Why |
|--------|---------|-----|
| User | unique email, sparse unique phone, text(name/email), role+status | Auth + admin search |
| TechnicianProfile | trustScore, category+district+trust, 2dsphere, text(skills) | Discovery & ranking |
| Job | status+createdAt, status+district, geo 2dsphere, text search, customer/tech compounds | Feeds, nearby, search |
| JobApplication | unique job+tech, tech+status+createdAt, job+status+matchScore | Apply inbox & sorting |
| Conversation | participants+lastMessageAt | Inbox pagination |
| Message | conversationId+createdAt desc | Thread pagination |
| Notification | userId+createdAt, userId+readAt | Unread lists |
| Review/Rating | technicianId+createdAt / overall | Profile ratings |
| TrustScore | composite desc | Leaderboards |
| AuditLog | createdAt, resourceType+resourceId | Compliance queries |
| SearchAnalytics | searchedAt, text(query) | Product analytics |
| RefreshToken/Session | TTL on expiresAt | Automatic cleanup |

Compound indexes follow **equality → sort → range** access patterns expected by list endpoints.

---

## 7. Scalability strategy

1. **Read models via denormalization** — trust, category names, last message preview reduce multi-collection joins on hot paths.
2. **Write-heavy events isolated** — `UserActivity`, `SearchAnalytics`, `AuditLog` can later move to a dedicated analytics cluster / time-series collection without changing core domain.
3. **Soft deletes** avoid expensive physical deletes and preserve referential history for disputes.
4. **TTL indexes** on sessions, refresh tokens, and optional notification expiry.
5. **2dsphere** for nearby technician/job queries; district string indexes for Uganda admin-boundary filters (cheaper than geo when GPS missing).
6. **Sharding keys (future):** `Job` by `location.district` or hashed `customerId`; `Message` by `conversationId`; `Notification` by `userId`.
7. **Index-only pagination** using `_id` / `createdAt` cursors (services will implement cursor helpers later).

---

## 8. Future expansion strategy

| Feature | Collections already present |
|---------|-----------------------------|
| Subscriptions | `SubscriptionPlan`, `Subscription` + User/Technician denorm fields |
| Lead purchase | `LeadPurchase`, `TechnicianProfile.leadCredits` |
| Escrow | `EscrowTransaction`, wallet hold fields |
| Spare parts marketplace | `MarketplaceListing`, `HardwarePartner` |
| Technician Academy | `AcademyCourse`, `academyProgressPercent` |
| Service contracts | `ServiceContract` |
| Coupons / promotions | `Promotion`, `Coupon` |
| Loyalty | `LoyaltyLedger`, `User.loyaltyPoints` |
| AI recommendations | `AiRecommendation`, Job `aiMatchScore` / `recommendedTechnicianIds` |

No destructive migrations required to turn these on — only services and product flags.

---

## 9. Major design decisions (why)

1. **Separate profiles per role** — Customer and Technician field sets diverge heavily; keeps User lean and secure (`passwordHash` select:false).
2. **SavedTechnician as join collection** — avoids unbounded arrays on CustomerProfile and enables notes + timestamps.
3. **AdminRole / Permission RBAC** — AdminUser stores denormalized `permissionKeys` for O(1) authorize checks; Permission docs remain source of truth.
4. **Job history embedded** — status transitions are small and always loaded with the job; separate event store can be added later if volume demands.
5. **Application ≠ Assignment** — bidding and engagement are different lifecycles (withdraw vs cancel assignment).
6. **TrustScore collection + denorm** — recompute jobs write once to TrustScore, then project into TechnicianProfile for indexed search.
7. **Review vs Rating** — content moderation vs numeric trust inputs.
8. **Soft-delete plugin** — consistent GDPR/account-lock workflows without losing forensic data.
9. **dbName forced to `FixNow`** — URI path cannot silently point at the wrong database in multi-env setups.
10. **Legacy aliases** (`Application`, `AdminProfile`, `Settings`, `PortfolioItem`, `VerificationRequest`) — keep existing repositories compiling while the canonical names match the product glossary.

---

## 10. Soft delete contract

Every domain schema includes:

```ts
isDeleted: boolean; // default false, indexed
deletedAt: Date | null;
createdAt / updatedAt; // timestamps: true
```

Default `find*` / `countDocuments` exclude `isDeleted: true` unless `Query` option `{ withDeleted: true }` is set (for admin recovery tools).

---

## 11. Compatibility notes for the existing API foundation

- Routes / controllers / services were **not** changed.
- Repositories still compile against `User`, `CustomerProfile`, `TechnicianProfile`, `AdminUser`/`AdminProfile`, `Job`, `Application`.
- `constants/status.ts` re-exports domain `JOB_STATUS` (including `posted`, `technician_en_route`, `archived`).

---

## 12. Verification checklist

```bash
cd backend
npm install
npm run build
# npm test  — not configured (no test script)
npm start
# GET /health → ok, mongodb connected (db FixNow)
# POST /api/v1/auth/login with valid body → 501 NOT_IMPLEMENTED
```
