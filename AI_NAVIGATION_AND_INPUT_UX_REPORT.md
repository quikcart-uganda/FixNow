# AI Navigation & Input UX Report

**Date:** 2026-07-26  
**Scope:** Customer/Technician navigation clutter reduction + AI FAB restore + composer / voice UX polish  
**Constraint:** No changes to conversation logic, role prompts, or backend AI APIs

---

## Summary

| Change | Result |
|---|---|
| Bottom nav | Customer: **Home · Search · Post · Jobs · Chat** only (AI Help removed) |
| AI entry | Circular floating action button above bottom nav on Customer, Technician, Admin, Guest |
| Content clearance | `.fixnow-ai-fab-pad` on shell mains — FAB never covers content |
| Composer layout | `[ + ] [ Ask FixNow… ] [ Camera ] [ Mic \| Send ]` |
| Voice | Tap to record, timer, live waveform, cancel, send recording, speech-to-text when supported |

---

## 1. Bottom navigation

### Customer (`apps/customer/components/CustomerShell.tsx`)

- Removed `<AiAssistantLauncher … embedded />` from the bottom nav.
- Tabs remain: Home, Search, Post, Jobs, Chat.
- Desktop left rail unchanged (same five destinations).

### Technician (`apps/technician/components/layout/AppShell.tsx`)

- Already had no AI tab (Home / Jobs / Inbox / Profile).
- FAB retained; main content now uses `.fixnow-ai-fab-pad`.

---

## 2. Floating AI button (FAB)

### Behaviour

- Circular **56×56** button (`h-14 w-14`), primary fill, sparkle icon.
- Fixed via `.fixnow-ai-fab` above the bottom nav + safe-area insets.
- Desktop (md+): FAB sits near the bottom-right without nav clearance.
- Minimised sessions show a pill **Continue** control (same safe-area positioning).
- `embedded` mode deprecated — AI is always a FAB.

### Content padding

`.fixnow-ai-fab-pad` applied to:

- Customer `<main>`
- Technician `<main>` (when chrome visible)

Values:

- Mobile: ~9.5rem (nav + FAB + gap + safe area)
- Tablet (md): ~5.5rem
- Desktop (lg): ~2.5rem

---

## 3. Composer redesign (`packages/shared/ai/AiComposer.tsx`)

Suggested layout implemented:

```
[ + ]  [ Ask FixNow… ]  [ Camera ]  [ Mic | Send ]
```

| Control | Behaviour |
|---|---|
| **+** | Attachment sheet: Photo library, Camera, File |
| **Text** | Autosizing textarea; Enter sends (Shift+Enter newline) |
| **Camera** | Direct device camera shortcut (when capability + prefs allow) |
| **Microphone** | Shown when the draft is empty; tap starts recording |
| **Send** | Replaces the microphone once text (or a ready attachment) is present |

Conversation / send pipeline in `AiAssistantPanel` is unchanged.

---

## 4. Voice recording UX

| Feature | Implementation |
|---|---|
| Tap to record | Mic starts `useAiVoice.start()` |
| Timer | `m:ss` while recording |
| Waveform | `AnalyserNode` levels → animated bars |
| Cancel | Aborts recording / preview |
| Send recording | Preview → edit transcript → **Send recording** |
| Speech-to-text | Web Speech API when available (`en-UG`); editable fallback |

Hook: `packages/shared/ai/useAiVoice.ts` (additive `levels` only).

---

## 5. Preserved (untouched)

- `aiApi` endpoints and chat streaming
- Role-specific prompts / `roleCopy`
- Attachment upload pipeline
- Admin Ops Assistant FAB mount
- JWT / auth

---

## 6. Files modified

| File | Change |
|---|---|
| `apps/customer/components/CustomerShell.tsx` | Remove AI tab; always mount FAB; fab pad |
| `apps/technician/components/layout/AppShell.tsx` | fab pad on main |
| `packages/shared/AiAssistantLauncher.tsx` | Circular FAB; deprecate `embedded` |
| `packages/shared/AiGuestWelcome.tsx` | Circular FAB parity |
| `packages/shared/ai/AiComposer.tsx` | Layout + mic/send swap + waveform UI |
| `packages/shared/ai/useAiVoice.ts` | Live waveform levels |
| `packages/shared/AiAssistantPanel.tsx` | Pass `voiceLevels` |
| `src/index.css` | FAB position, fab-pad, waveform styles |

---

## 7. Testing checklist

| Check | Expected |
|---|---|
| Customer bottom nav | No AI Help — five tabs only |
| Customer FAB | Present on mobile and desktop when AI enabled + authenticated |
| Technician FAB | Present (except message threads with chrome hidden) |
| Voice button | Visible when draft empty and mic capability on |
| Camera shortcut | Opens device camera / Capacitor camera path |
| Content not obscured | Scroll end clears FAB + nav |
| Android / iPhone | Safe-area insets respected |
| Desktop | FAB bottom-right; side rail unchanged |
| Reduced motion | Rec-dot / wave transitions disabled |

Manual follow-up on device: open Ask FixNow → record a note → confirm transcript → send; take a photo via Camera shortcut; confirm Post Job / Messages scroll past the FAB.
