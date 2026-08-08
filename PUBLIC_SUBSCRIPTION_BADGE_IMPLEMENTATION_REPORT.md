# PUBLIC_SUBSCRIPTION_BADGE_IMPLEMENTATION_REPORT

## Summary

Customers can see admin-configured Professional/Business (and other paid-plan) trust badges on technician surfaces. Badges are presentation-only: text, icon, colours, glow, size. Prices, expiry, billing status, entitlements, and raw subscription documents are never exposed.

---

## Backend

### Helper

`backend/src/services/marketplace/publicSubscriptionBadge.ts`

| Export | Role |
|--------|------|
| `sanitizePublicBadge` | Strips admin-only fields; returns `{ text, icon, color, borderColor, glow, size }` or `null` |
| `resolvePublicSubscriptionBadge` | Paid access check + plan badge + surface visibility |
| `resolvePublicBadgesForProfiles` | Batch resolve for lists |

Surfaces: `search` | `profile` | `card` | `chat` (chat wiring reserved; inbox header is job-title based today).

Visibility respects plan badge flags (`visibleOnSearch`, `visibleOnProfile`, `visibleOnChat`). Disabled / empty text → no badge. Free / inactive paid access → no badge.

### API attachment points

| Service | Surface |
|---------|---------|
| `technician.service.ts` | Public profile + search results (sanitized) |
| `job.service.ts` | Job applicants |
| `offer.service.ts` (`marketing`) | Offer technician snaps |
| `customer.service.ts` | Saved technicians — public card + badge only (no raw User/full billing profile) |

---

## Customer UI

Uses shared `packages/ui/SubscriptionBadge.tsx`.

| Screen | File |
|--------|------|
| Home technician / featured cards | `apps/customer/pages/HomePage.tsx` |
| Search results | `apps/customer/pages/SearchPage.tsx` |
| Technician profile | `apps/customer/pages/TechnicianProfilePage.tsx` |
| Job applications | `apps/customer/pages/JobApplicationsPage.tsx` |
| Offer cards | `apps/customer/components/CustomerOfferCard.tsx` |
| Offer detail | `apps/customer/pages/OfferDetailPage.tsx` |

Types: `apps/customer/data.ts`, `packages/api/offersApi.ts` (`technician.subscriptionBadge`), mapper passthrough in `packages/api/mappers.ts`.

Plan-name chips (`professional` / `business` / `starter`) are filtered where the trust badge already communicates plan presence on search cards.

---

## Admin configuration

Badge copy, colours, icon, glow, size, and surface visibility remain on **Admin → Subscriptions → plan badge** (existing catalogue). No customer-facing billing fields were added.

---

## Privacy / leak guardrails

- Customer DTOs only receive sanitized badge objects.
- Saved-technicians list no longer returns raw User / internal subscription fields.
- Offer snaps include the same sanitized badge shape.
- Boost chip (`SubscriptionBadge boostActive`) remains separate from plan trust badge.

---

## Verification checklist

- [ ] Paid Professional/Business tech appears with configured badge on search, home, profile, applications, offer card/detail.
- [ ] Free technician: no plan trust badge.
- [ ] Admin disable badge / clear text → badge disappears on customer surfaces.
- [ ] Network payloads for public tech/offer/applicant endpoints contain no prices, `periodEnd`, payment status, or entitlement blobs.
- [ ] Saved technicians list shows badge when eligible and does not expose billing internals.

---

## Out of scope (unchanged)

Subscription purchase flows, entitlement enforcement, dashboard redesign, and chat inbox peer badges (surface flag exists; conversation UI is job-centric).
