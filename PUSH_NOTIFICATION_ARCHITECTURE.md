# FixNow Push Notification Architecture

Production push notifications for Web, Android, and iOS (APNs via FCM).  
This layer does **not** change authentication, JWT, RBAC, MongoDB schemas for existing domains, marketplace business rules, Socket.IO contracts, or messaging schemas. New collections `DeviceToken` and `PushDeliveryLog` were added for device + delivery tracking. Existing `Notification` and `NotificationPreference` models are used as-is.

## Overview

```
Event (auth / marketplace / messaging / admin)
        │
        ▼
 createDbNotification / notifyUser / notifyAdmins
        │
        ├─► Notification (in-app)     — if channels.inApp
        │
        └─► Preference checks (push, category, quiet hours)
                │
                ▼
         Active DeviceToken[] (web / android / ios)
                │
                ▼
         FCM provider (or console in local/dev)
                │
                ▼
         PushDeliveryLog + invalid token cleanup
```

## Platforms

| Platform | Token source | Delivery |
|----------|--------------|----------|
| **Web** | `PushProvider` registers stable `web:local:{deviceId}` (or injected `VITE_FCM_WEB_TOKEN`) | FCM web push when credentials configured; console provider locally |
| **Android** | Native FCM SDK → `POST /devices` | FCM |
| **iOS** | APNs token via FCM → `POST /devices` | FCM → APNs |

Set `PUSH_PROVIDER=fcm` and `FCM_ENABLED=true` with Firebase service-account env vars for production.

## Device management

| API | Purpose |
|-----|---------|
| `POST /devices` | Register / upsert token + metadata |
| `POST /devices/refresh` | Token refresh (invalidate old, register new) |
| `POST /devices/remove` | Soft-deactivate device |
| `GET /devices` | List active devices for current user |

Supports **multiple devices per user**. Fields: `platform`, `deviceId`, `appVersion`, `userAgent`, `locale`, `timezone`, `lastActiveAt`, `lastRegisteredAt`. Invalid FCM tokens are deactivated automatically (`invalidReason`).

## User preferences

Stored on existing `NotificationPreference` (no schema change):

| Setting | Storage |
|---------|---------|
| Enable/disable push | `channels.push` |
| Categories | `categories` Map: `auth`, `marketplace`, `messaging`, `admin` |
| Sound / badge | `categories.sound`, `categories.badge` |
| Quiet hours | `quietHours.{start,end,timezone}` |

APIs: `GET/PUT /notifications/preferences`.

Quiet hours skip push (logged as `skipped` / `quiet_hours`) unless `bypassQuietHours` (security: lock/unlock/password reset).

## Event mapping

| Event | Type string | Category | Typical recipients |
|-------|-------------|----------|--------------------|
| Welcome | `auth.welcome` | auth | New user |
| Password reset | `auth.password_reset` | auth | User |
| Account locked | `auth.account_locked` | auth | User |
| Account unlocked | `auth.account_unlocked` | auth | Technician |
| Job published | `job.published` | marketplace | Admins |
| Technician applied | `application.received` | marketplace | Customer |
| Technician assigned | `application.accepted` | marketplace | Technician |
| En route / started | `job.technician_en_route` / `job.in_progress` | marketplace | Parties |
| Job completed | `job.completed` | marketplace | Customer + technician |
| Job cancelled | `job.cancelled` | marketplace | Parties |
| New message | `message.new` | messaging | Other participants |
| Mention | `message.mention` | messaging | Other participants |
| Attachment | `message.attachment` | messaging | Other participants |
| New user | `admin.user_registered` | admin | Admins |
| Technician locked | `technician.locked` | admin / marketplace | Tech + admins |
| Broadcast | `admin.announcement` | admin | Targeted roles/users |

## Delivery flow

1. Persist in-app `Notification` (optional).
2. Load preferences → skip if push/category disabled or quiet hours.
3. Fan-out to all active devices.
4. Write `PushDeliveryLog` per device (`queued` → `sent` / `failed` / `skipped`).
5. On invalid token → deactivate device.
6. On transient FCM error → schedule `nextRetryAt` (exponential backoff, max 3 attempts).

Background worker (`PUSH_RETRY_INTERVAL_MS`, default 60s) calls `processPushRetries`.

## Retry strategy

- Attempts: 1…`maxAttempts` (default 3)
- Backoff: `30s * 2^(attempt-1)`
- Admin: `POST /admin/push/retry/:id`, `POST /admin/push/process-retries`
- Stats: `GET /admin/push/stats?days=7`
- Broadcast: `POST /admin/notifications/broadcast`

## Frontend

- `PushProvider` (inside `AuthProvider` / `SocketProvider`): permission prompt, auto device register/refresh, badge via title + `navigator.setAppBadge`, unread polling.
- Shared `NotificationsInbox` in Customer + Technician portals.
- Admin Notification Center: stats, retries, broadcast.

## Environment

```bash
PUSH_PROVIDER=console   # or fcm
FCM_ENABLED=false
PUSH_RETRY_INTERVAL_MS=60000
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
# or FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

## Verification

```bash
# Frontend
npm install && npm run build

# Backend
cd backend && npm install && npm run build && npm start

# Push E2E (API up, console provider)
node scripts/push-e2e.mjs
```

Covers: apply → customer push, assign → tech push, offline message push, completion for both, token refresh, invalid token cleanup, preference respect.
