# FixNow Frontend API Integration

This document describes how the Customer, Technician, and Admin React portals communicate with the shared FixNow backend (`/api/v1`). Backend business logic, schemas, JWT rules, and marketplace rules were **not** modified for this integration.

## Architecture

```
apps/customer | apps/technician | apps/admin
        \             |              /
         \            |             /
          v           v            v
              packages/api  (HTTP + domain APIs)
              packages/hooks (AuthProvider, useAsync)
              packages/shared (ProtectedRoute, AsyncStateView)
                          |
                          v
              http://localhost:4000/api/v1
```

- **Single HTTP client:** Axios instance in `packages/api/client.ts`
- **No duplicated fetch logic** across portals — all network calls go through shared `*Api` modules
- **UI layouts preserved** — screens only swapped mock data for API-backed state

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:4000/api/v1` | API base URL |

See `.env.example`.

## Shared API modules

| Module | Responsibility |
|--------|----------------|
| `authApi` | Register, login, logout, refresh, me, OTP, forgot/reset/change password, sessions |
| `customerApi` | Profile, addresses, saved technicians, job history |
| `technicianApi` | Profile, search, public profile, availability, coverage, services, dashboard, trust |
| `jobsApi` | Create, list, nearby, get, update, status, publish, cancel, archive |
| `applicationsApi` | Apply, list for job, list mine, accept, reject, withdraw |
| `categoriesApi` | List/create/update categories & subcategories |
| `adminApi` | Dashboard, metrics, users, technicians, jobs, applications, suspend/unlock, free-job overrides |
| `dashboardApi` | Thin aliases for admin/technician dashboards |
| `notificationsApi` | List / mark read (**API only** — no push implementation) |

Mappers live in `packages/api/mappers.ts` and adapt API payloads to existing UI types without redesigning components.

## Authentication flow

1. **Register** → `POST /auth/register` (role `customer` or `technician`)
2. **OTP** → `POST /auth/verify-otp` (`email_verification`; development may return `debugOtp`)
3. **Login** → `POST /auth/login` with optional `rememberMe`
4. Tokens stored in `localStorage` (remember) or `sessionStorage` (session-only) via `tokenStorage`
5. Axios request interceptor injects `Authorization: Bearer <accessToken>`
6. On **401**, interceptor calls `POST /auth/refresh`, retries the original request once
7. If refresh fails → clear session → AuthProvider marks anonymous → protected routes redirect to login
8. **Logout** → `POST /auth/logout` + clear storage
9. **Forgot / reset password** → forgot → OTP → reset
10. **Role-aware redirects** via `ProtectedRoute` (`customer` / `technician` / `admin`)

`AuthProvider` (`packages/hooks`) hydrates from stored tokens on load (`GET /auth/me`) so sessions survive refresh.

## Screen → endpoint mapping

### Customer

| Screen | Endpoints |
|--------|-----------|
| Login / Register / Forgot | `/auth/login`, `/auth/register`, `/auth/verify-otp`, `/auth/forgot-password`, `/auth/reset-password` |
| Home | `/customers/me`, `/categories`, `/technicians/search` |
| Categories | `/categories` |
| Search | `/technicians/search` |
| Technician profile | `/technicians/:id` |
| Post job | `/categories`, `POST /jobs` |
| My jobs | `/customers/me/jobs` |
| Job tracking | `/jobs/:id` |
| Applications | `/jobs/:id/applications`, `POST /applications/:id/accept\|reject` |
| Profile | `/customers/me`, logout |

### Technician

| Screen | Endpoints |
|--------|-----------|
| Login / Register | Auth endpoints + `/categories`, `/technicians/me/profile` |
| Dashboard | `/technicians/me/dashboard`, `/jobs/nearby`, `/jobs?mine=true` |
| Jobs feed / details | `/jobs/nearby`, `/jobs/:id`, `POST /jobs/:id/applications` |
| Active / assigned / complete | `/jobs?mine=true`, `/jobs/:id`, `PATCH /jobs/:id/status` |
| Availability / areas / services | `/technicians/me/availability`, `/coverage`, `/services`, `/working-hours` |
| Profile / lock state | `/technicians/me/profile` (free jobs + lock) |
| Messages / reviews / portfolio / notifications / achievements | Backend not implemented (501) → empty UI states |

### Admin

| Screen | Endpoints |
|--------|-----------|
| Login | `/auth/login` (role must be `admin`) |
| Dashboard | `/admin/dashboard`, `/admin/marketplace/metrics`, `/categories`, `/admin/applications` |
| Technicians | `/admin/technicians`, suspend/unlock |
| Customers | `/admin/users` (customer list), suspend/unlock |
| Jobs | `/admin/jobs` |
| Free jobs / locks | `/admin/settings/free-jobs`, `/admin/technicians/:id/free-jobs`, unlock |
| Categories | `/categories` CRUD |
| Trust engine | `/admin/technicians`, `POST /technicians/:id/trust-score/recompute` |
| Verification / broadcasts / content / audit / subscriptions / reports | Not implemented → empty “Not available yet” states |

## Error handling strategy

Centralized in `packages/api/errors.ts` + Axios interceptor:

| Status | UX |
|--------|----|
| 401 | Refresh retry; on failure logout + redirect |
| 403 | Friendly permission / account-lock message |
| 404 | Not found message |
| 409 | Conflict — refresh and retry |
| 422 / 400 | Validation message from API |
| 500+ | Generic server error |
| Network | Connection error message |

`getFriendlyErrorMessage()` is used on forms and `AsyncStateView` error panels.

## Loading / empty / error / retry

`useAsync` + `AsyncStateView` standardize:

- **Loading** spinner
- **Empty** title + hint
- **Error** message + **Retry**
- **Success** renders children

No blank pages for async screens.

## State management

- **Auth:** single `AuthProvider` for all portals
- **Technician profile/lock:** `AppProvider` loads `/technicians/me/profile` and refreshes after apply/status changes
- **Screen data:** `useAsync` per screen (no duplicated global mock stores)
- **Optimistic UI:** local applied-job IDs / status maps updated after successful API responses; profile re-fetched for free-job counters and lock state

## Real-time UI (without backend changes)

After successful mutations the UI reloads relevant queries:

- Job created → navigate to tracking for that job id
- Application submitted → mark applied + refresh profile
- Application accepted → reload applications + job status
- Job status updates → reload job detail / active list
- Admin unlock / free-job override → reload technician lists

## Removed mock data

Removed hardcoded technicians, jobs, KPIs, dashboards, and demo unlock flows from:

- `packages/api` (was in-memory mocks)
- `apps/customer/data.ts` (types only now)
- Technician `AppContext` seed profile / unlockDemo
- Admin `@fixnow/api/admin` mock datasets

Screens whose backends return 501 show explicit empty states — not fake data.

## Verification checklist

```bash
# Frontend
npm install
npm run build          # Customer + Technician + Admin (single Vite app)

# Backend (unchanged)
cd backend && npm run build
```

End-to-end against running API (`npm start` in backend):

1. Customer registers → OTP → login → creates job  
2. Technician registers → OTP → login → discovers nearby job → applies  
3. Customer opens applications → accepts technician  
4. Technician progresses job status → customer completes  
5. Admin dashboard shows updated counts; free-job / trust fields update on technician profile  
6. Admin unlock / free-job override reflected on next technician profile fetch  

## Out of scope (intentionally)

- Messaging, payments, reviews product features
- Push notifications
- Backend / schema / JWT / marketplace rule changes
