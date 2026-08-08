# FixNow Reviews & Reputation Architecture

Production reviews, ratings, and reputation for FixNow.  
Does **not** change auth/JWT/RBAC, marketplace transition rules, existing Mongo schemas for Review/Rating/Trust, messaging, push contracts, or Socket.IO auth. New collection `PeerReview` supports technician → customer reviews without altering unique `jobId` on Review/Rating.

## Review lifecycle

```
Job status = completed
        │
        ├─ Customer → Technician  → Review + Rating (1 per job)
        │                              │
        │                              ├─ ratingAverage / reviewCount
        │                              ├─ Reputation (technician)
        │                              ├─ Badges / achievements
        │                              └─ recomputeTrustForTechnician() [existing formula]
        │
        └─ Technician → Customer  → PeerReview (1 per job per technician)
                                       │
                                       └─ Reputation (customer)
```

| Action | Who | Rules |
|--------|-----|-------|
| Create | Job participant | Only completed jobs; one review per direction |
| Edit | Author (or admin) | Within `REVIEW_EDIT_WINDOW_MS` (default 24h) |
| Flag | Authenticated user | Sets `isFlagged` |
| Moderate | Admin | `approve` / `hide` / `remove` (soft delete) |
| Soft delete | Admin only | `isDeleted` + `deletedAt` |

## Rating dimensions

Stored on **Rating** (customer → technician):

| Field | Meaning |
|-------|---------|
| `overall` | Overall stars 1–5 |
| `quality` | Quality of work |
| `professionalism` | Professionalism |
| `communication` | Communication |
| `timeliness` | Punctuality |
| `valueForMoney` | Value for money (optional) |
| `comment` | On Review |

Peer reviews store overall + professionalism / communication / punctuality + comment.

## Reputation calculation

`Reputation` collection (`userId` + `role`):

- Start score **100**
- Event deltas: 5★ +15, 4★ +8, 3★ +2, 2★ −8, 1★ −20
- Clamp **0–1000**
- Levels: `new` / `rising` / `established` / `respected` / `elite`

Summary endpoint also returns:

- Average rating + distribution
- Completion / cancellation rates (from profile job stats)
- Trust dimensions (existing trust engine — **not rewritten**)
- Badges

## Badge rules

Seeded keys (idempotent upsert):

| Key | Rule |
|-----|------|
| `first_job` | jobsCompleted ≥ 1 (also via trust recompute) |
| `reliable_10` | jobsCompleted ≥ 10 |
| `trusted_pro` | trust ≥ 80 |
| `five_star` | received a 5★ review |
| `top_rated` | avg ≥ 4.5 and ≥ 5 reviews |
| `community_favorite` | ≥ 25 public reviews |

Badge earn → in-app + push (`badge.earned`) + socket `badge:earned`.

## Moderation workflow

1. User flags review → `isFlagged=true`
2. Admin lists `GET /admin/reviews?flagged=true`
3. Admin acts: approve (unflag + public), hide (private), remove (soft delete)
4. Technician averages recompute after hide/remove

## Realtime events

| Event | Audience |
|-------|----------|
| `review:submitted` | Reviewer, reviewee, admin |
| `review:edited` | Reviewee, admin |
| `reputation:updated` | User, admin |
| `badge:earned` | User, admin |
| `trust:updated` | Existing trust emit after rating refresh |

## Notifications

Uses `createDbNotification` / push pipeline:

- `review.received`
- `review.edited`
- `badge.earned`

## API endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/reviews` | Customer or technician |
| `PATCH` | `/reviews/:id` | Edit within window |
| `POST` | `/reviews/:id/flag` | Flag |
| `GET` | `/jobs/:id/reviews` | Both directions + permissions |
| `GET` | `/technicians/:id/reviews` | Public tech reviews + summary |
| `GET` | `/reputation/me` | Reputation summary |
| `GET` | `/admin/reviews` | Moderation list |
| `GET` | `/admin/reviews/analytics` | Stats |
| `POST` | `/admin/reviews/:id/moderate` | approve/hide/remove |
| `GET` | `/achievements` | Catalog |
| `GET` | `/achievements/me` | Progress + badges |

## Frontend

- Customer: review form on completed job tracking
- Technician: reviews inbox, achievements/badges, reciprocal review on completed assigned job
- Admin: `/admin/reviews` moderation portal

## Verification

```bash
npm install && npm run build
cd backend && npm install && npm run build && npm start
node scripts/reviews-e2e.mjs
```
