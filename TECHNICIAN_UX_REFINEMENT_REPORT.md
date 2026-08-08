# Technician UX Refinement Report

## 1. UX audit findings

| Area | Finding | Action |
|---|---|---|
| Registration payment step | Plain cards + “Yellow/Red identity” developer copy | Brand-inspired MTN / Airtel payment cards |
| Upgrade Account | Escrow, Academy, Phase 2, “Architected…”, billing-not-live | Benefit-led plans + Available soon messaging |
| Earnings | “Escrow”, “wallet ledger”, “admin approval” | Technician-friendly income language |
| Portfolio | Competitor (Jiji) mention + unfinished dump | Available soon cards |
| Marketing | “Pipeline”, “admin approves” | Offer status / FixNow review wording |
| Jobs / Locked | Harsh “customer contacts” / “Blocked” | Softer pause language |
| AI Assistant | Shared redesign already role-aware | Confirmed Pro Assistant multimodal UX |

Customer and Admin portals were not modified.

## 2. Content removed

- Yellow identity / Red identity / “Uganda tokens only for payment UX”
- Escrow-ready payouts, Academy discounts, Lead purchase credits (Phase 2)
- “Architected for lead purchase, escrow, and academy modules”
- “Subscription billing is not live yet…”
- “Escrow releases · … · wallet ledger”
- “Held in escrow”, “Pending escrow”, “Wallet ledger”
- “Waiting for admin approval”
- Jiji / directory competitor comparison
- “Pipeline” label
- “Awaiting admin review” / “until an admin approves”

## 3. Content simplified

| Before (concept) | After |
|---|---|
| Internal subscription architecture | Unlock more jobs & visibility |
| Escrow / ledger jargon | Funds held, pending release, transaction history |
| Admin approval | FixNow review / we will notify you |
| Portfolio engineering empty state | Portfolio available soon |
| Marketing pipeline | Offer status |
| Blocked customer contacts | Applying & customer details paused |

## 4. Payment card improvements

New component: `apps/technician/components/MobileMoneyProviderCards.tsx`

- MTN: yellow `#FFCC00` + black accents, original SVG mark (not official trademark art)
- Airtel: red `#E60000` + white accents, original SVG mark
- Logo area, brand colour fill, provider name, selected / unselected / hover / active press
- Radio semantics (`role="radiogroup"` / `aria-checked`)
- Touch-friendly min height + `tap-target` / `touch-manipulation`
- Clear “Selected: MTN MoMo / Airtel Money” confirmation under the cards

Wired into registration Payment Details (`RegisterPage` step 3).

## 5. AI improvements

Technician shell already mounts shared `AiAssistantLauncher role="technician"`.

Confirmed Pro Assistant UX includes:

- Role-aware welcome & starters (jobs, offers, profile, pricing, availability)
- Side menu with recent / pinned chats, settings, help, privacy
- Modern composer, typing indicator
- Image upload, camera, gallery
- Voice record with preview / cancel / permission handling
- Soft-disable when unsupported (no fake controls)

No Customer/Admin AI copy changes required for this pass.

## 6. Voice support

Shared AI composer (technician role):

- Mic control when MediaRecorder + getUserMedia available
- Recording state, stop, cancel
- Playback + editable transcript before send
- Permission denial messaging
- Preference toggle to hide mic

## 7. Camera support

Shared AI composer (technician role):

- Camera capture (Capacitor Camera on native; capture input on web)
- Gallery picker
- Multi-image attach (up to 4), preview, remove, upload progress
- Attachment metadata ready for future vision understanding

## 8. Mobile improvements

- Payment cards stack on narrow screens (`grid-cols-1` → `sm:grid-cols-2`)
- Larger tap targets on upgrade / lock / earnings actions (`min-h-11`)
- Existing AppShell bottom nav already uses `pb-safe`, `tap-target`, `touch-manip`
- AI overlay already respects safe areas (previous shared work)

## 9. Files modified

| File | Change |
|---|---|
| `apps/technician/components/MobileMoneyProviderCards.tsx` | **Added** branded provider selector |
| `apps/technician/pages/RegisterPage.tsx` | Payment step uses new cards + clearer copy |
| `apps/technician/pages/UpgradePage.tsx` | Benefit-led plans + Available soon feature cards |
| `apps/technician/pages/EarningsPage.tsx` | Income wording cleanup |
| `apps/technician/pages/PortfolioPage.tsx` | Available soon / no competitor copy |
| `apps/technician/pages/LockedPage.tsx` | Softened pause language + touch targets |
| `apps/technician/pages/JobsFeedPage.tsx` | Softened lock banner copy |
| `apps/technician/pages/marketing/MarketingLayout.tsx` | Review wording |
| `apps/technician/pages/marketing/MarketingDashboardPage.tsx` | Offer status / awaiting review |
| `apps/technician/pages/marketing/CreateOfferPage.tsx` | FixNow review wording |
| `apps/technician/components/layout/AppShell.tsx` | “applications left” header copy |
| `TECHNICIAN_UX_REFINEMENT_REPORT.md` | This report |

## 10. Regression testing

| Check | Status focus |
|---|---|
| Technician registration → Payment Details | MTN / Airtel cards select correctly |
| MTN selected state | Yellow card + check |
| Airtel selected state | Red card + check |
| Upgrade page | Benefit language only; Available soon |
| Earnings page | No escrow/admin/ledger jargon in UI |
| Portfolio | Available soon, no Jiji |
| Marketing | Offer status / FixNow review |
| AI Pro Assistant | Voice / camera / gallery / history |
| Mobile Web / Android Capacitor / Desktop | Technician-only surfaces |
| Customer portal | Untouched |
| Admin portal | Untouched |

## Success criteria

- Technician UX reads professional and role-specific
- Payment cards clearly communicate MTN Uganda / Airtel Uganda via colour + layout
- No customer-only or internal engineering copy on technician screens audited
- AI supports voice, camera, and images where the device allows
- Subscription screens describe technician benefits
- Changes isolated to `apps/technician` (+ this report)
