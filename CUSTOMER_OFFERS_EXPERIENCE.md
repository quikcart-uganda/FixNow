# Customer Offers Experience

**Status:** Implemented  
**UX rule:** Extends the existing Stitch Customer theme — no redesign of shells, tokens, or navigation density.

---

## 1. Objective

Surface admin-approved technician promotions inside the Customer app with a premium discovery experience:

- Home rails for Featured / Nearby / Recommended / Expiring soon / Popular  
- Browse + filter list  
- Rich offer detail  
- Save / favourite / share / expiry reminders  
- Alerts when a favourited technician publishes a promotion  
- Offline cache of recent / home offers  

Public visibility remains gated by the marketing subsystem: **approved lineage + live schedule window only**.

---

## 2. Customer surfaces

| Route | Purpose |
|-------|---------|
| `/customer/home` | **Today’s Offers** section (horizontal rails) |
| `/customer/offers` | Browse + filters (category + sort) |
| `/customer/offers/:id` | Detail: description, technician, terms, rules, book |
| `/customer/offers/saved` | Favourited / saved offers |

Profile → **Saved offers** + toggle **Favourite technician offers** notifications.

---

## 3. Offer card (Stitch language)

`apps/customer/components/CustomerOfferCard.tsx`

Displays:

- Banner (or brand-gradient fallback)  
- Discount badge  
- Technician photo + name  
- Rating  
- Distance / nearby label  
- Offer expiry countdown  
- Remaining redemptions  
- **Book Now** → post-job deep link with `offerId` + `technicianId`  
- **Save** (heart)  
- **Share** (Web Share API / clipboard)  

Uses existing tokens: `rounded-xl`, `border-border-subtle`, `bg-canvas-white`, `text-title-md`, `text-label-caps`, primary indigo.

---

## 4. Home — Today’s Offers

After Best Match, before Categories:

1. Featured promotions  
2. Nearby offers (customer district)  
3. Recommended offers  
4. Expiring soon  
5. Popular promotions  

Data: `GET /offers/public/home?district=` via `offersApi.homeFeed`.  
Cached under `CACHE_KEYS.customerOffersHome` (20 min).

---

## 5. Filters (browse)

`/customer/offers`

- Category chips (from `categoriesApi`)  
- Nearby  
- Highest Discount  
- Newest  
- Expiring Soon  
- Most Popular  

Mapped to `sort` / district query params on `GET /offers/public`.

---

## 6. Detail page

`/customer/offers/:id`

- Full description  
- Technician profile card (link to `/customer/technician/:id`)  
- Eligible services  
- Expiry + remaining  
- Usage rules (min booking, max discount, weekday/time windows, per-customer limit)  
- Terms  
- Expiry reminder toggle  
- Sticky **Book directly** + Save  

Tracks `view` on open; `click` on book.

---

## 7. Customer features

| Feature | Mechanism |
|---------|-----------|
| Favourite / save offer | `SavedOffer` model · `POST/DELETE /offers/saved/:id` |
| Share offer | `navigator.share` or clipboard link |
| Expiry reminder | `PATCH /offers/saved/:id/reminder` · `sendDueExpiryReminders()` |
| Favourite technician promo alert | On admin **approve**, notify customers who saved that technician when `preferences.notifyFavouriteTechnicianOffers !== false` |

---

## 8. Offline

| Key | Content | TTL |
|-----|---------|-----|
| `customer.offers.home.v1` | Home feed buckets | 20 min |
| `customer.offers.recent.v1` | Last browse list | 30 min |

Uses Capacitor Preferences / localStorage via `cacheSet` / `cacheGet`. Browse page shows a soft “cached offers” hint when falling back.

---

## 9. Backend enrichment

Public list / home / detail responses include:

```ts
technician: { id, name, photoUrl, rating, trustScore, jobsCompleted, district, trade }
distanceLabel?: string
saved?: boolean
remindBeforeExpiry?: boolean
```

Endpoints added/extended:

- `GET /offers/public` — sort, category, section, optional auth for `saved`  
- `GET /offers/public/home`  
- `GET /offers/public/:id`  
- `GET/POST/DELETE /offers/saved…`  
- `PATCH /offers/saved/:id/reminder`  

---

## 10. Testing checklist

1. Home shows Today’s Offers only when public live offers exist.  
2. Pending/draft offers never appear.  
3. Card save toggles heart and appears under Saved offers.  
4. Share copies or opens system sheet.  
5. Detail Book Now opens post-job with query params.  
6. Reminder toggle persists via API.  
7. Airplane mode after a successful load still paints cached home/browse.  
8. Approving an offer notifies customers who saved that technician (pref on).  

---

## 11. Design constraints respected

- No new bottom-tab; discovery via Home + Profile.  
- Customer indigo theme / typography utilities unchanged.  
- Horizontal snap rails match Categories / Top Rated patterns.  
- Admin approval remains the sole path to customer visibility.
