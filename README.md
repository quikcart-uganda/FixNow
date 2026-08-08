# FixNow — Customer Marketplace App

Responsive React web app for FixNow, Uganda’s technician-services marketplace. Built from the Stitch Elite Customer UX HTML prototypes.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Portals

| Portal | Entry |
|--------|--------|
| **Customer** (primary) | Splash → Onboarding → Auth → `/home` — or **Skip to Customer** on splash |
| **Technician** | Splash → **Technician** → `/tech/dashboard` |
| **Admin** | Splash → **Admin** → `/admin/login` |

## Customer flows included

- Splash, onboarding, register / login / OTP / forgot password
- Home dashboard: AI Best Match, categories, nearby / top rated / active / verified rails, community proof, FixNow Guarantee
- Search with filters → technician profile (trust scores, portfolio before/after, badges, safety)
- Post job wizard (6 steps) → applications compare → live tracking → confirm → multi-category review
- Messages, notifications, profile, settings, saved techs, referrals, community, help

## Competitive advantage UX

- Trust / Reliability / Completion / Response / Punctuality scores
- Reputation levels (Beginner → Master) + badges
- AI match % + job success prediction
- Portfolio-first proof of work
- Visit verification code, share visit, emergency support
- Hyperlocal parish/district copy + Mobile Money readiness
- Future modules surfaced in Settings (subscriptions, escrow, spare parts, etc.)

## Stack

Vite · React 19 · TypeScript · Tailwind CSS v4 · React Router · Material Symbols
