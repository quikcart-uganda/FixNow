# AI Chat UX Polish Report

## Summary

Mobile chrome for the FixNow AI Assistant was cleaned up to feel like a premium consumer app. Chat logic, backend APIs, and AI behaviour are unchanged.

## Components updated

| Component | Change |
|---|---|
| `packages/shared/AiAssistantPanel.tsx` | Mobile header: menu · avatar · title · status · Close only; warmer disclaimer placement; thread spacing |
| `packages/shared/AiAssistantLauncher.tsx` | Mobile backdrop closes (not minimises); no minimise prop on compact screens |
| `packages/shared/ai/roleCopy.ts` | Natural status labels + warmer disclaimers per role |
| `packages/shared/ai/AiLanding.tsx` | More whitespace, clearer hierarchy, larger touch chips |
| `packages/shared/ai/AiComposer.tsx` | Slightly softer composer chrome |
| `src/index.css` | Compact header / disclaimer polish helpers |

## Screens affected

All roles that host the shared launcher:

- Customer (`Ask FixNow`)
- Technician (`Pro Assistant`)
- Admin (`Ops Assistant`)

Guest welcome was not changed (no authenticated chat chrome).

## Before / after

### Header (mobile)

| Before | After |
|---|---|
| ☰ · avatar · title · conversation title · status · **New** · **−** · **X** | ☰ · avatar · title · subtle status · **X** |

Desktop keeps **New** and minimise (−) for window-style workflow.

### Status text

| Role | Before | After |
|---|---|---|
| Customer | Ready to help | Ready to help |
| Technician | Ready to coach | Ask me anything |
| Admin | Ready for ops | Available now |
| Loading | Checking availability… | Connecting… |
| Unavailable | Currently unavailable | Unavailable |

### Footer disclaimer (customer)

| Before | After |
|---|---|
| I assist only — I never book, pay, or change accounts for you. Confirm on the real FixNow screens. | I'm here to guide you. When it's time to book, pay or confirm something, I'll take you to the right FixNow screen. |

Technician and Admin disclaimers were warmed in the same tone (guide / confirm in-app).

### Layout polish

- Disclaimer sits above the composer so the input stays pinned above the keyboard / home indicator
- Landing hero gets more vertical rhythm
- Message thread spacing increased slightly
- Mobile backdrop dismisses the assistant fully (no orphan minimise without a − control)

## Regression checks

| Check | Expectation |
|---|---|
| Mobile open AI | Header shows only menu, logo, title, status, Close |
| Mobile Close (X) | Closes assistant |
| Mobile backdrop tap | Closes assistant |
| Desktop New | Still available; starts fresh chat |
| Desktop minimise (−) | Still available; FAB returns as Continue |
| Side menu → New | Still creates a new conversation on all sizes |
| Send / history / voice / camera | Unchanged behaviour |
| Customer / Technician / Admin | Shared polish; role copy only differs in wording |
| Keyboard on Android / iPhone | Composer remains at bottom with safe-area padding |

## Out of scope (unchanged)

- AI providers, tools, prompts, and conversation memory
- Backend `/ai/*` routes
- Message send / receive logic
- Multimodal upload and voice recording behaviour
