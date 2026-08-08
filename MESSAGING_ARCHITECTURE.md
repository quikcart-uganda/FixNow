# FixNow Messaging Architecture

Production in-app messaging between Customers and Technicians, integrated with the existing Socket.IO layer.  
This layer does **not** change authentication, JWT, RBAC rules, MongoDB schemas, marketplace business rules, or existing REST contracts (except messaging endpoints). Push notifications, payments, and reviews are out of scope.

## Overview

```
Job assigned / completed (marketplace side-effect)
              │
              ▼
   messagingService (ensure / lock / system message)
              │
     ┌────────┴────────┐
     ▼                 ▼
  REST /api/v1      Socket.IO emits
  conversations/    conversation:{id} + user:{id}
  messages/               │
     │                    ▼
     └────────► Customer / Technician / Admin (read-only) UI
```

## Conversation lifecycle

| Stage | Trigger | Behavior |
|-------|---------|----------|
| **Create** | Technician assigned to a job (or `POST /conversations/job/:id`) | One `type: 'job'` conversation per job; participants = customer + assigned technician |
| **Active** | Job in progress | Participants may send text, images, location; typing + receipts enabled |
| **System events** | Assign / complete / similar | System messages inserted (e.g. technician assigned, job completed) |
| **Archive** | Participant calls archive | Soft leave / archive for that participant (`POST .../archive`) |
| **Close (lock)** | Job completed or cancelled | `isLocked = true`; conversation becomes **read-only** for customers and technicians |
| **Reopen** | Admin only | `POST /conversations/:id/reopen` clears lock so messaging can resume |

Rules:

- **One conversation per active job** (`jobId` + `type: 'job'`).
- Admins may list and open any conversation but **cannot send**.
- Non-participants cannot load or join a conversation room.

## Database usage

Existing models in `backend/src/models/communication/Messaging.ts` (schemas unchanged):

| Collection | Role |
|------------|------|
| `Conversation` | Job-scoped thread: participants, last message preview, `isLocked`, soft-delete |
| `ConversationParticipant` | Per-user unread, last read, join/leave |
| `Message` | Body, type (`text` / `image` / `location` / `system`), edit/delete, delivery |
| `MessageAttachment` | Image URLs and metadata |

Configurable edit window: `MESSAGE_EDIT_WINDOW_MS` (default **15 minutes**).

## Security model

1. **HTTP**: All messaging routes require `authenticate`. Admin-only reopen uses `authorize(ROLES.ADMIN)`.
2. **Participants**: Service asserts membership via `participantUserIds` + `ConversationParticipant` (unless admin).
3. **Job binding**: `ensureForJob` allows only the job’s customer, assigned technician, or admin.
4. **Sockets**: `conversation:join` requires membership or admin; typing events ignore non-members.
5. **Emit scope**: Events go to `conversation:{id}` and participant `user:{id}` rooms (plus admin for conversation updates). No broadcast to unrelated users.
6. **RBAC**: Admins are monitor-only (`canSend: false`). Locked conversations reject send/edit.

## REST API endpoints

Base: `/api/v1`

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| `GET` | `/conversations` | Auth | List (search `q`, pagination, `archived`) |
| `POST` | `/conversations/job/:id` | Customer / assignee / admin | Ensure job conversation |
| `GET` | `/conversations/:id` | Participant / admin | Conversation + paginated messages (`q` searches bodies) |
| `GET` | `/conversations/:id/messages` | Participant / admin | Same as get (messages focus) |
| `POST` | `/conversations/:id/read` | Participant | Mark read + emit receipt |
| `POST` | `/conversations/:id/archive` | Participant | Archive for caller |
| `POST` | `/conversations/:id/reopen` | Admin | Unlock closed conversation |
| `POST` | `/messages` | Customer / technician | Send text / image / location |
| `PATCH` | `/messages/:id` | Sender | Edit within window |
| `DELETE` | `/messages/:id` | Sender | Soft delete for sender |
| `POST` | `/messages/:id/delivered` | Recipient | Delivery confirmation |
| `POST` | `/uploads` | Auth | Image upload for attachments |

## Socket.IO event catalog

### Client → server

| Event | Payload | Notes |
|-------|---------|-------|
| `conversation:join` | `conversationId` + ack | Authorized join of `conversation:{id}` |
| `conversation:leave` | `conversationId` | Leave room |
| `typing:start` / `typing:stop` | `{ conversationId }` | Relayed to other participants |

### Server → client

| Event | Audience | When |
|-------|----------|------|
| `message:new` | Conversation + participant user rooms | Message created (incl. system) |
| `message:edited` | Same | Edit within window |
| `message:deleted` | Same | Soft delete |
| `message:read` | Same | Read receipt update |
| `message:delivered` | Same | Delivery confirmation |
| `typing:started` / `typing:stopped` | Other participants | Typing indicators |
| `conversation:updated` | Participants + admin | Preview, lock, counts |

Rooms used: `conversation:{id}`, `user:{userId}`, `role:admin` (updates only).

## Frontend integration

| Portal | Entry | Behavior |
|--------|-------|----------|
| **Customer** | `/customer/messages`, job tracking **Open chat** | Full send UI via `ChatThread` |
| **Technician** | `/technician/messages`, assigned job **Message customer** | Same; `ensureForJob` then navigate |
| **Admin** | `/admin/messages` | Inbox + `ChatThread` with `readOnly` |

Shared components: `ConversationInbox`, `ChatThread` (`packages/shared`).  
States: loading / empty / error + retry via `AsyncStateView`. Realtime via existing `SocketProvider` + messaging event subscriptions.

## Message capabilities

| Capability | Support |
|------------|---------|
| Text | Yes |
| Image attachments | Yes (`/uploads` + message meta) |
| Location sharing | Yes (`location` on send) |
| System messages | Yes (service helpers; not client-sendable) |
| Edit | Yes, within `MESSAGE_EDIT_WINDOW_MS` |
| Delete for sender | Soft delete |
| Read receipts | Yes |
| Delivered status | Yes |
| Typing indicators | Yes |
| Timestamps | Message `createdAt` / `editedAt` |

## Verification

```bash
# Frontend (repo root)
npm install
npm run build

# Backend
cd backend
npm install
npm run build
npm start

# Messaging E2E (API must be running)
node scripts/messaging-e2e.mjs
```

Expected E2E coverage: customer → technician realtime send/receive, reply, read receipts, typing, admin read-only history, locked conversation after job complete.
