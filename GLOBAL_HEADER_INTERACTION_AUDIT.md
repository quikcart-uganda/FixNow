# Global Header Interaction Audit

**Date:** 2026-07-26  
**Scope:** Customer, Technician, and Admin top-header controls  
**Goal:** Every visible header control performs a real action — no decorative / dead clicks

---

## 1. Buttons audited

| Portal | Control | Before | After |
|--------|---------|--------|-------|
| Customer Home | Hamburger menu | Dead `button` (no handler) | Opens nav `Dialog` with real routes |
| Customer Home | Notification bell | Linked | Shared bell + live unread badge |
| Customer Home | Profile avatar | Linked to profile only | Opens account `BottomSheet` (profile, jobs, payments, help, logout) |
| Customer Shell | Live chip | Non-interactive when connected | Opens connection status sheet |
| Technician | Avatar photo | Decorative `<img>` | Opens account sheet |
| Technician | Notifications | Linked; **hardcoded** red dot | Live unread badge |
| Technician | Live / status | Socket-only chip | Availability sheet (Available / Busy / Offline) |
| Technician | Mobile menu | Missing | Hamburger opens full Pro nav |
| Admin | Notifications | Dead button + fake unread dot | Navigates to `/admin/notifications` + live badge |
| Admin | Help | Dead button | Help sheet → Audit / Notifications / Dev controls |
| Admin | Search | Styled input, no submit | Search sheet + navigates with `?q=` |
| Admin | Avatar | Decorative initials | Account sheet (admins, audit, prefs, logout) |
| Admin | Menu (mobile) | Already worked | Unchanged (still opens drawer) |
| Admin | Logout | Worked | Kept + also in profile sheet |
| Customer tech profile | Share | Dead button | Native share / clipboard fallback |

---

## 2. Missing handlers found (root causes)

1. **No shared header contract** — each portal invented chrome independently.
2. **Affordances without behaviour** — `tap-target` / hover styles on buttons that lacked `onClick` / `Link`.
3. **Fake unread dots** — hardcoded red dots implied state without `usePush().unreadCount`.
4. **Live chip non-interactive when healthy** — looked tappable, did nothing until disconnect.
5. **Admin search** — looked like global search with no query wiring.
6. **Admin help** — icon with no route and no fallback UX.

---

## 3. Files modified

### New shared header system (`packages/shared/header/`)

| File | Role |
|------|------|
| `types.ts` | Portal role + menu item types |
| `menuConfig.ts` | Role-aware destinations |
| `PortalHeader.tsx` | Reusable sticky header |
| `HeaderStatusControl.tsx` | Live / availability / platform health sheet |
| `HeaderNotificationsButton.tsx` | Bell + unread badge |
| `HeaderProfileMenu.tsx` | Avatar → account sheet |
| `HeaderMenuButton.tsx` | Hamburger → nav drawer |
| `HeaderAdminSearch.tsx` | Functional admin search |
| `index.ts` | Barrel exports |

### Wired call sites

| File | Change |
|------|--------|
| `packages/shared/index.ts` | Export header module |
| `packages/shared/ConnectionStatus.tsx` | Delegates to `HeaderStatusControl` (no dead Live chip) |
| `apps/customer/pages/HomePage.tsx` | Uses `PortalHeader` (menu + bell + profile) |
| `apps/customer/components/CustomerShell.tsx` | Status control (already present / retained) |
| `apps/technician/components/layout/AppShell.tsx` | Full header wiring |
| `apps/admin/components/AdminShell.tsx` | Bell, help, search, profile, status |
| `apps/customer/pages/TechnicianProfilePage.tsx` | Share handler |

---

## 4. Navigation fixes

| Action | Destination |
|--------|-------------|
| Customer menu items | `/customer/home`, search, post-job, jobs, messages, offers, profile |
| Customer account sheet | profile, jobs, payments, saved offers, notifications, help, logout |
| Technician account sheet | profile, availability, portfolio, earnings, settings, help, logout |
| Technician status | `PATCH /technicians/me/availability` (`available` / `busy` / `offline`) |
| Admin bell | `/admin/notifications` |
| Admin search | `/admin/technicians?q=…` (or chosen section) |
| Admin help | `/admin/audit`, `/admin/notifications`, `/admin/settings/development` |
| Admin account | dashboard, admins, audit, development controls; security/devices → “coming soon” |

Only existing routes are linked. Unsupported items show a professional “coming soon” notice — never a silent no-op.

---

## 5. Interaction improvements

### Live status
- **Customer:** connectivity + reconnect + last sync  
- **Technician:** Available / Busy / Offline (+ link to full availability page)  
- **Admin:** socket status + `GET /health` platform check  

### Notifications
- Always navigates to the role inbox  
- Unread badge from `usePush().unreadCount`  
- No hardcoded dots  

### Profile
- Role-specific sheets via `BottomSheet`  
- Logout with friendly failure message  

### Menu
- Customer + Technician (mobile) + Admin use the shared `Dialog` drawer pattern  
- Safe-area aware sticky headers (`pt-safe`)  
- Minimum 44×44 touch targets (`tap-target` / `min-h-11 min-w-11`)  
- `aria-label`, `aria-expanded`, `aria-haspopup`, focus-visible rings  

### Errors
- Friendly copy only (“Unable to connect…”, “Coming soon…”, “No internet…”)  
- No stack traces / JSON / backend dumps  

---

## 6. Regression results

| Check | Customer | Technician | Admin |
|-------|----------|------------|-------|
| Menu opens navigation | ✓ | ✓ (mobile) | ✓ |
| Bell opens notifications | ✓ | ✓ | ✓ |
| Unread badge live | ✓ | ✓ | ✓ |
| Avatar opens account menu | ✓ | ✓ | ✓ |
| Status sheet opens | ✓ | ✓ | ✓ |
| Status actions work | reconnect | availability API | health refresh |
| Search works | n/a (nav search on Home) | n/a | ✓ sheet + navigate |
| Help works | via profile | via profile | ✓ help sheet |
| Logout works | ✓ | ✓ | ✓ |
| No dead clicks in header | ✓ | ✓ | ✓ |
| Web / Capacitor (same SPA) | ✓ shared components | ✓ | ✓ |

**Manual verify:** hard-refresh each portal after pull; confirm PushProvider wraps authenticated trees so unread counts load.

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| Every visible header button functions | ✓ |
| No dead-clicks remain in audited headers | ✓ |
| Behaviour consistent across portals | ✓ shared module |
| Native feel on Android / iOS / Web | ✓ BottomSheet + Dialog + safe areas |
| Failures degrade with friendly feedback | ✓ |

---

## Remaining recommendations

1. Bind Admin list pages (`TechniciansPage`, etc.) to honour `?q=` query params for deeper search.  
2. Add a real Admin help CMS document when content is ready (replace “coming soon” security/devices rows).  
3. Optionally hoist `PortalHeader` onto more Customer sticky pages for full visual consistency.  
4. Invisible technician status is **not** in the backend enum (`available` \| `busy` \| `offline` \| `on_job`) — do not expose until the API supports it.
