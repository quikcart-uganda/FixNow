# FixNow Unified Google Maps & Location Platform

## Implementation Report

**Status:** Complete — Google Maps Platform is the official primary location provider across FixNow. Nominatim and Haversine are emergency-only fallbacks after confirmed Google failure. Web, Android, AI, and the recommendation engine consume one Location Service.

---

## 1. Location architecture

```
Customer / Technician / Admin / AI / Recommendation Engine
                    │
                    ▼
        Unified Location Service
        (backend/src/services/location/location.service.ts)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Google      Nominatim    Haversine
   (primary)   (fallback 1)  (last resort)
```

Frontend reverse geocoding calls `GET /location/reverse-geocode` (never BigDataCloud as primary).  
Map tiles remain Google Maps JS (`TrackingMap` + `VITE_GOOGLE_MAPS_API_KEY`).

---

## 2. Provider hierarchy

| Priority | Provider | Role |
|----------|----------|------|
| 1 | **Google Maps Platform** | Geocoding, reverse geocoding, Places autocomplete, Directions, Distance Matrix / ETA |
| 2 | **Nominatim (OSM)** | Emergency reverse/forward geocode after Google retries fail |
| 3 | **Haversine** | Local distance/ETA approximation only — never routing, traffic, billing, or turn-by-turn |

**Policy:** The platform never randomly alternates providers. Switching occurs only after retry exhaustion and a failure threshold. Automatic recovery probes restore Google without admin intervention.

---

## 3. Google integration

Server key: `GOOGLE_MAPS_SERVER_API_KEY` (aliases: `GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY` as last resort).

Implemented Google APIs:

- Geocoding / Reverse Geocoding  
- Places Autocomplete  
- Distance Matrix (traffic-aware when available)  
- Directions (optional polyline)  

Frontend tiles: existing `TrackingMap.tsx` Google Maps JS loader.

---

## 4. Failover strategy

1. Attempt Google (configured retries, default 3).  
2. On persistent failure (≥ `failureThreshold`), activate fallback order: Nominatim → Haversine.  
3. While on fallback, probe Google every `recoveryProbeMs` (default 120s).  
4. On healthy probe → automatic return to Google + failover log entry.

Users continue to receive addresses / ETA without noticing the transition.

---

## 5. Health monitoring

Runtime + persisted `PlatformSetting` keys:

- `location.platform` — settings  
- `location.health` — consecutive failures, active provider, latencies  
- `location.failover_log` — last 50 failovers  

Admin dashboard (`/admin/location`) shows health score, capability matrix, Google/Nominatim status, failover log, and runnable health checks.

---

## 6. Retry policy

Configurable via Admin:

- `retryAttempts` (default 3)  
- `timeoutMs` (default 8000)  
- `failureThreshold` (default 3)  
- `recoveryProbeMs` (default 120000)  

---

## 7. AI integration

AI does not invent distances. Customer/technician tools call marketplace services that:

- Rank via the recommendation engine  
- Enrich visible ETA via `locationService.distanceAndEta` (Google-first)  

Reverse geocode for “near me” flows goes through the same Location Platform APIs.

---

## 8. Web and Android integration

| Surface | Behaviour |
|---------|-----------|
| Shared SPA + Capacitor | Same `locationApi` + `reverseGeocodeCoords` |
| Tracking map | Google Maps JS (unchanged tiles) |
| GPS | Capacitor / browser geolocation → Location Platform reverse geocode |
| Job / tech discovery | Backend Location Platform for road ETA on result pages |

No Android-only provider logic.

---

## 9. Backend changes

| Path | Purpose |
|------|---------|
| `backend/src/services/location/location.service.ts` | Unified facade + failover |
| `backend/src/services/location/locationSettings.service.ts` | Admin settings |
| `backend/src/services/location/providers.ts` | Google / Nominatim / Haversine adapters |
| `backend/src/controllers/index.ts` | `locationController` |
| `backend/src/routes/index.ts` | Public + admin location routes |
| `backend/src/services/providers/provider.catalog.ts` | Maps catalog: Google primary, Nominatim/Haversine fallbacks |
| `backend/src/config/env.ts` | `GOOGLE_MAPS_SERVER_API_KEY` |
| `recommendation.service.ts` | `computeEtaViaLocationPlatform` |
| `technician.service.ts` | Enrich search page ETAs via Location Platform |

---

## 10. API changes

| Method | Path | Auth |
|--------|------|------|
| GET | `/location/reverse-geocode` | Optional |
| GET | `/location/geocode` | Optional |
| GET | `/location/autocomplete` | Optional |
| GET | `/location/distance-eta` | Optional |
| GET | `/admin/location` | Admin + CanManageProviders |
| GET/PUT | `/admin/location/settings` | Admin + CanManageProviders |
| POST | `/admin/location/health-check` | Admin + CanManageProviders |
| GET | `/admin/location/failover-log` | Admin + CanManageProviders |

Client: `packages/api/locationApi.ts`

---

## 11. Validation results

| Check | Result |
|-------|--------|
| Google always attempted first | ✓ `withProviderPolicy` |
| Fallback only after confirmed failure | ✓ retries + threshold |
| Nominatim first fallback | ✓ fallback order |
| Haversine last resort only | ✓ no routing claims |
| AI uses shared location path | ✓ via marketplace + Location Service |
| Web = Android | ✓ shared SPA / APIs |
| Automatic Google recovery | ✓ recovery probe |
| No BigDataCloud as primary | ✓ removed from reverse geocode path |
| Admin dashboard | ✓ `/admin/location` |

---

## 12. Future enhancements

- Places Details + photos for business lookup  
- Batch Distance Matrix for full search pages (quota-aware)  
- In-app Directions polyline on TrackingMap when Google healthy  
- Address Validation API for job posting  
- Geofencing callbacks for “arrived” events  
- Separate Maps JS browser key restrictions vs server key IP restrictions  

---

## Configuration checklist

1. Set `GOOGLE_MAPS_SERVER_API_KEY` on the backend (Geocoding, Places, Directions, Distance Matrix enabled).  
2. Set `VITE_GOOGLE_MAPS_API_KEY` for tracking map tiles.  
3. Open Admin → **Location Services** → Run health check.  
4. Confirm Provider Manager → Maps → Google active.

The implementation is complete when every location capability uses Google Maps Platform as the single authoritative provider, with Nominatim and Haversine acting strictly as resilient emergency fallbacks.
