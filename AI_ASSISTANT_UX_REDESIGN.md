# FixNow AI Assistant UX Redesign

## Summary

The FixNow AI Assistant was redesigned end-to-end as a premium, role-aware assistant experience. QuikCart was used only as a UX/interaction reference. Implementation stays inside FixNow’s existing shared launcher/panel architecture and reuses the current AI backend, providers, tools, safety layer, and conversation memory.

## Existing AI architecture (preserved)

```
CustomerShell / Technician AppShell / AdminShell
        ↓
AiAssistantLauncher(role)
        ↓
AiAssistantPanel(role)
        ↓
aiApi → POST /ai/{role}/chat
        ↓
aiService.chat → safety → context → memory → tools → provider → sanitize
```

**Reused without redesign:**

- Role-gated chat endpoints (`/ai/customer|technician|admin/chat`)
- `aiService` orchestration, tool allowlists, prompt manager, safety validator
- OpenAI / Gemini / console providers
- Mongo `AiConversation` + `AiMessage` history
- Auth, RBAC, rate limiting, circuit breakers
- Shell mounts (`CustomerShell`, `AppShell`, `AdminShell`)
- Guest orientation entry (`AiGuestWelcome` on platform landing)

## Components reused

| Component / module | Role after redesign |
|---|---|
| `AiAssistantLauncher` | Premium fullscreen/sheet host, FAB, focus trap, safe areas |
| `AiAssistantPanel` | Orchestrator for landing ↔ conversation, history, send path |
| `aiApi` | Extended request shape; same endpoints |
| `messagesApi.uploadImage` | Shared `/uploads` path for AI attachments |
| `@fixnow/native` camera helpers | Capacitor photo capture / gallery |
| Backend AI stack | Context now accepts attachment metadata; greetings/suggestions updated |

## UX improvements

### Role-aware welcome

- **Customer:** personalized “Hi {name}” + booking/find/cost guidance
- **Technician:** “Welcome back” + offers/jobs/profile coaching
- **Admin:** “Welcome back” + platform/moderation/ops assistance
- Starters and post-reply suggestions are role-scoped; customers never see Pro/Admin prompts

### Modern chat UI

- Assistant avatar + FixNow primary gradient mark
- Role-aware header with conversation title + live status (Ready / Thinking / Listening)
- Landing hero vs conversation thread state machine
- Rounded bubbles, timestamps, typing indicator
- Smooth open/rise animations with `prefers-reduced-motion` support

### Side panel

Collapsible conversations rail with:

- Recent conversations
- Pinned conversations (local per user+role)
- New conversation
- Delete conversation / clear history
- Settings, Help, Privacy sheets
- Close / collapse control

### Composer

- Auto-growing text input
- Send button
- Attachment menu (+): photo library, camera, file
- Camera + mic controls (soft-disabled when unavailable)
- Paste images
- Desktop drag-and-drop
- Voice recording with cancel, playback, transcript review before send
- Upload progress on attachments
- No fake emoji picker (device keyboard emoji remains available)

### Multimodal readiness

- Images upload via existing `/uploads`
- Attachment metadata travels in chat `attachments` + `context` for future vision models
- Provider prompt notes that pixel-level vision may be limited until a vision provider is configured
- UI does not need redesign to enable vision later

## New capabilities

| Capability | Behaviour |
|---|---|
| Role copy module | `packages/shared/ai/roleCopy.ts` |
| Capability probe | Soft-disable camera/mic/file/drag when unsupported |
| Voice notes | MediaRecorder + optional SpeechRecognition; confirm before send |
| Image/camera | Web file/capture + Capacitor Camera plugin |
| History delete / clear | Wired to existing DELETE conversation API |
| Pins | Client-local, role+user scoped |
| Settings sheet | Mic/camera visibility prefs |

## Files modified / added

### Added

- `packages/shared/ai/types.ts`
- `packages/shared/ai/roleCopy.ts`
- `packages/shared/ai/capabilities.ts`
- `packages/shared/ai/useAiAttachments.ts`
- `packages/shared/ai/useAiVoice.ts`
- `packages/shared/ai/AiLanding.tsx`
- `packages/shared/ai/AiMessageBubble.tsx`
- `packages/shared/ai/AiComposer.tsx`
- `packages/shared/ai/AiSidePanel.tsx`
- `packages/shared/ai/AiInfoSheet.tsx`
- `packages/shared/ai/index.ts`
- `AI_ASSISTANT_UX_REDESIGN.md`

### Modified

- `packages/shared/AiAssistantPanel.tsx`
- `packages/shared/AiAssistantLauncher.tsx`
- `packages/shared/AiGuestWelcome.tsx`
- `packages/api/aiApi.ts`
- `packages/api/index.ts`
- `src/index.css`
- `backend/src/validators/index.ts` (`aiChatSchema` attachments/inputMode)
- `backend/src/controllers/index.ts` (pass attachments/inputMode)
- `backend/src/services/ai/ai.service.ts` (suggestions + attachment context)
- `backend/src/services/ai/context/context.manager.ts`
- `backend/src/services/ai/conversation/conversational.core.ts` (role greetings)

## Mobile verification

| Surface | Expected |
|---|---|
| Desktop (≥900px) | Wider shell, collapsible sidebar column, drag-drop enabled |
| Tablet / mobile web | Full-viewport sheet, drawer sidebar, safe-area padding |
| Android Capacitor | FAB above bottom nav; native camera/gallery when plugin present; mic via WebView MediaRecorder |
| Safe areas | Overlay/composer/header respect `env(safe-area-inset-*)` |
| Keyboard | Overlay accounts for `--fixnow-keyboard-height` |

## Accessibility review

- Dialog roles, labelled headers, Escape closes/minimises
- Focus trap retained on open panel
- Soft-disabled controls remain visible with unavailable affordances
- Typing indicator uses `aria-live`
- Icon buttons have `aria-label`
- Motion disabled under `prefers-reduced-motion`
- Long-press starter prefill avoids accidental send after long-press
- Composer uses ≥16px input size on mobile to reduce iOS zoom

## Regression testing

| Case | Status focus |
|---|---|
| Customer AI | Customer copy, starters, customer chat endpoint only |
| Technician AI | Pro copy/starters; no customer booking marketing as primary |
| Admin AI | Ops copy/starters; admin endpoint only |
| Desktop | Sidebar collapse, drag-drop, keyboard send |
| Mobile web | Fullscreen sheet, drawer, safe areas |
| Android Capacitor | FAB clearance, camera/gallery, mic permission denial path |
| Conversation history | List / open / new / delete / clear / pin |
| Image upload | Preview, progress, send with attachment context |
| Voice recording | Record → stop → playback → edit transcript → send/cancel |
| Camera | Native or capture input; denied permission messaging |
| Role-aware prompts | Cross-role content not shown in UI starters |
| AI disabled | Unavailable state; rest of FixNow unaffected |
| Guest welcome | Sign-in CTAs only; no authenticated chat |

## Intentionally not fake

- Dedicated emoji picker UI (use OS emoji keyboard)
- Silent auto-send of voice transcripts
- Claiming full vision analysis before a vision-capable provider is wired
- Admin tools exposed outside Admin shell

## Success criteria checklist

- Matches FixNow visual language (primary blue, surfaces, Material Symbols)
- QuikCart-quality interaction patterns without copied QuikCart code
- Customer / Technician / Admin content isolation in UI + API
- Camera, image upload, voice where supported; graceful disable otherwise
- Consistent desktop / mobile web / Capacitor shell behaviour
- Existing AI architecture preserved
- Changes isolated to AI shared UI + minimal backend request/context extensions
