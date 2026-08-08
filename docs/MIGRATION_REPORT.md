# FixNow Architecture Migration Report

**Date:** 2026-07-23  
**Project:** `D:\FixNow\FIXNOW APP\FIXNOW APP`  
**Build:** `npm run build` — **passed** (tsc + vite)

## Goal

Restructure FixNow into a QuikCart-like clean layout:

- Role apps isolated under `apps/`
- Reusable code under `packages/`
- Single platform router serving Customer, Technician, and Admin
- Recover Customer UX from the Stitch Elite HTML reference without redesigning technician/admin visuals

## Final structure

```
FIXNOW APP/
├── apps/
│   ├── customer/          # Stitch-recovered customer experience
│   ├── technician/        # Existing Pro technician ecosystem
│   └── admin/             # Existing command center
├── packages/
│   ├── ui/                # Button, Card, Badge, Field, Icon, Progress
│   ├── types/             # Shared + admin types
│   ├── api/               # Technician + admin mock services
│   ├── utils/             # cn / initials
│   ├── hooks/             # Barrel (ready for shared hooks)
│   └── shared/            # Barrel (ready for cross-role helpers)
├── backend/               # Placeholder for future API
├── docs/                  # IA / journey / wireframe docs
├── src/                   # Platform shell only
│   ├── App.tsx            # Platform router
│   ├── PlatformLanding.tsx
│   ├── main.tsx
│   ├── index.css
│   └── assets/
└── public/
```

## What moved where

| Before | After |
|--------|--------|
| `src/pages/*` (technician) | `apps/technician/pages/*` |
| `src/components/layout`, `jobs`, `trust` | `apps/technician/components/*` |
| `src/context/AppContext.tsx` | `apps/technician/context/AppContext.tsx` |
| `src/admin/*` | `apps/admin/*` |
| `src/components/ui/*` | `packages/ui/*` |
| `src/types/*` | `packages/types/*` |
| `src/data/mock.ts` | `packages/api/index.ts` (+ service wrappers) |
| `src/admin/data/mock.ts` | `packages/api/admin.ts` |
| `src/lib/cn.ts` | `packages/utils/cn.ts` |
| Stitch HTML (Customer ux) | `apps/customer/reference/stitch/*` |
| IA markdown | `docs/*` |

## Routing (single platform)

| Path | App |
|------|-----|
| `/` | Platform landing (choose Customer / Technician / Admin) |
| `/customer/*` | Customer app |
| `/technician/*` | Technician app (provider-wrapped) |
| `/admin/*` | Admin command center |

Double `BrowserRouter` removed — only `src/main.tsx` owns the router.

## Customer recovery (from Stitch)

Reference HTML copied under `apps/customer/reference/stitch`.

React screens (visual language preserved — Inter / Material Symbols / FixNow tokens):

- Splash, Onboarding, Login, Register
- Home dashboard (AI match, categories, nearby technicians)
- Categories, Search, Technician profile
- Post job, Job tracking
- Profile & settings, Help center
- `CustomerShell` bottom / side nav

## Import aliases

Configured in `vite.config.ts` + `tsconfig.app.json`:

- `@fixnow/ui`, `@fixnow/utils`, `@fixnow/types`, `@fixnow/api`, `@fixnow/hooks`, `@fixnow/shared`
- `@customer/*`, `@technician/*`, `@admin/*`
- `@/*` → platform `src/` only

## Isolation rules enforced

- Customer code lives only in `apps/customer`
- Technician code lives only in `apps/technician`
- Admin code lives only in `apps/admin`
- Shared primitives / models / services live in `packages/*`
- Role-specific shells (CustomerShell, AppShell, AdminShell) stay in their apps

## Design / features

- Technician and Admin screens were relocated and re-aliased — **no visual redesign**
- Technician features retained (jobs, active jobs, earnings, lock/upgrade, messages, reputation, etc.)
- Admin features retained and **wired** into the platform at `/admin`
- Customer UX recovered from Stitch Elite reference (was previously missing)

## Build verification

```
npm run build
✓ tsc -b
✓ vite build (103 modules)
```

## Follow-ups (optional)

1. Convert remaining Stitch screens (payments, invoice, chat, ratings) to React pages under `apps/customer/pages`
2. Replace `@fixnow/api` mocks with real `backend/` HTTP clients
3. Extract shared hooks into `packages/hooks` as patterns emerge
4. Consider npm workspaces later if apps need independent deployables
