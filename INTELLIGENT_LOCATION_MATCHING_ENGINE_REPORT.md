# FixNow Intelligent Location Matching & Proximity Ranking Engine

## Implementation Report

**Status:** Complete — one backend recommendation engine powers customer discovery, invite/search lists, technician job feeds, and AI tools on Web and Android.

---

## 1. Recommendation architecture

FixNow keeps **one ranking engine** in the marketplace layer:

```
Customer Home / Search / Invite / AI searchTechnicians
        │
        ▼
GET /technicians/search  (+ optional lat/lng, categoryId, radiusKm)
        │
        ▼
recommendation.service.scoreTechnician()
  ← Admin weights from PlatformSetting `marketplace.recommendation`
  ← trust, rating, jobs, response, availability, verification,
     category match, subscription (capped), boost (capped), fairness

Technician Jobs Feed / AI listNearbyJobs
        │
        ▼
GET /jobs/nearby
        │
        ▼
recommendation.service.scoreJobForTechnician()
  ← distance, category, urgency, workload, freshness, job size
```

Location helpers (`haversineMeters`, ETA) live in `backend/src/services/tracking/geo.util.ts` and are reused by the recommendation service — **one location engine**.

---

## 2. Ranking algorithm

### Technician discovery (customer)

Weighted composite (Admin-tunable; defaults shown):

| Factor | Default weight | Behaviour |
|--------|----------------|-----------|
| Distance | 22 | Smooth falloff; outside max radius hard-demoted |
| Trust score | 16 | Platform trust composite |
| Rating | 18 | Star average → 0–100 |
| Completed jobs | 12 | Soft cap |
| Category match | 14 | Exact match when filtered; otherwise neutral |
| Response time | 10 | Avg minutes or responseScore |
| Availability | 8 | Available-now vs offline |
| Verification | 6 | Identity / skill / approved |
| Completion rate | 8 | Completed vs cancelled |
| Acceptance / punctuality | 6 | Soft reliability proxy |
| Recent activity | 4 | Last profile activity |
| Subscription | 4 | Soft; capped by `maxSubscriptionInfluence` |
| Boost / featured | soft | Capped by `maxBoostInfluence` |

**Core rule:** Distance alone never determines rank. Subscription/boost never override quality.

**Fairness:** Mild deterministic 6-hour rotation so equally strong nearby technicians share exposure (`fairnessStrength`).

### Job matching (technician)

Jobs are scored with distance, category match, urgency, technician availability, workload, freshness, and budget size. Results are sorted by `matchScore` (not raw `$near` order alone).

---

## 3. Customer discovery

- **Home** passes live `lat`/`lng` when permission is granted; otherwise district / saved address continues to work (never blocked).
- **Search / category filter** resets ranking within the selected category via `categoryId` (electricians are not compared to plumbers).
- Cards show: rating, jobs, trust, distance, ETA, response label, and decision indicators (Available Now, Top Rated, Verified, etc.).
- Server `rankingScore` is authoritative; client only applies light category-affinity soft preference.

---

## 4. Technician job matching

- `job.service.nearby` loads a candidate pool (geo `$near` when possible), scores with `scoreJobForTechnician`, then paginates.
- Feed cards show distance, **estimated travel time**, match %, reasons, urgency, and budget.
- Client filter no longer drops jobs with unknown distance (`distanceKm <= 0` allowed).

---

## 5. Invite Technician improvements

- Dedicated API: `GET /recommendations/technicians` (same engine as search).
- Search / home cards now expose invite-ready decision fields: photo, name, distance, ETA, rating, completed jobs, verification, response time, availability, plan indicators.
- Full “invite to open job” write path remains a future workflow; discovery ranking for invite UIs is ready.

---

## 6. Estimated arrival calculations

```
roadMeters = haversineMeters × roadDistanceFactor (default 1.35)
etaSeconds = roadMeters / (averageTravelSpeedKmh → m/s)  // default 25 km/h urban
```

Displayed as human labels (`8 min`, `15 min`, `1 h 10 min`) via `formatEta`. Traffic-aware speeds are future-ready (`speedMps` already accepted by `estimateEtaSeconds`).

---

## 7. Admin weighting controls

**Route:** `/admin/recommendations`  
**Capability:** `CanManageSubscriptions`  
**Storage:** `PlatformSetting` key `marketplace.recommendation`

Configurable:

- Engine on/off  
- All factor weights  
- Max search radius  
- Average travel speed  
- Road distance factor  
- Max subscription / boost influence  
- Fairness on/off + strength  
- Decision indicators / ETA toggles  

Changes apply on the next search/nearby request (no redeploy).

---

## 8. AI integration

- `searchTechnicians` and `listNearbyJobs` call the same marketplace services.
- Optional `lat`/`lng` from AI role context are forwarded into the engine.
- Tool summaries state rankings come from the FixNow recommendation engine — the LLM must not invent ranks.
- Environment isolation from the sandbox platform still applies to all AI retrieval.

---

## 9. Backend APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/technicians/search` | Ranked technicians (+ distance, ETA, indicators) |
| GET | `/recommendations/technicians` | Alias for invite / discovery |
| GET | `/jobs/nearby` | Ranked jobs (+ distance, ETA, matchReasons) |
| GET | `/admin/recommendations/settings` | Load weights |
| PUT | `/admin/recommendations/settings` | Update weights |

---

## 10. Database changes

- No new collections.
- Uses existing `PlatformSetting` document (`marketplace.recommendation`).
- Consumes existing TechnicianProfile / Job geo and performance fields (`trustScore`, `ratingAverage`, `jobsCompleted`, `responseTimeMinutesAvg`, `geo`, etc.).

---

## 11. Performance considerations

- Technician search scores in-memory after a lean profile query (same pattern as before).
- Nearby jobs fetch a capped candidate pool (≤200) then score/sort — avoids loading the entire posted-jobs set.
- Fairness jitter is O(1) per candidate (hash + time bucket).
- Boost impression tracking remains non-blocking.

---

## 12. Validation results

| Check | Result |
|-------|--------|
| Nearby technicians rank with multi-factor score | ✓ `scoreTechnician` |
| Category filter reranks within category | ✓ `categoryId` → categoryMatch factor |
| Invite / recommend uses same engine | ✓ `/recommendations/technicians` → `search` |
| Technician cards show summary indicators | ✓ Home + Search |
| Jobs prioritised by proximity + relevance | ✓ `scoreJobForTechnician` |
| AI uses recommendation engine | ✓ customer + technician tools |
| Web & Android identical rankings | ✓ Shared SPA + same API |
| Admin weight changes affect rankings | ✓ PlatformSetting read on each request |

---

## Key files

| Area | Path |
|------|------|
| Engine | `backend/src/services/marketplace/recommendation.service.ts` |
| Technician search | `backend/src/services/marketplace/technician.service.ts` |
| Nearby jobs | `backend/src/services/marketplace/job.service.ts` |
| Geo / ETA | `backend/src/services/tracking/geo.util.ts` |
| Admin UI | `apps/admin/pages/RecommendationEnginePage.tsx` |
| API client | `packages/api/recommendationApi.ts` |

The implementation is complete when customers see nearby, trustworthy, high-performing technicians; technicians receive relevant nearby jobs; and Web, Android, and AI all share one configurable recommendation engine.
