# LOGIN SCREEN UX AUDIT REPORT

**Date:** 2026-07-29  
**Scope:** Customer login (`/customer/login`)  
**Constraint:** No redesign, branding change, auth logic change, routing change, or new auth methods.

---

## 1. Duplicate elements removed

| Before | After |
|---|---|
| In-card: **New here? Create Account** → `/customer/register` | **Kept** (single account-creation CTA) |
| AuthShell footer: **Don't have an account? Sign Up** → `/customer/register` | **Removed** |

**Wording choice:** **Create Account** — matches Register page title, header guest CTAs, AuthGateSheet, and menu config. “Sign Up” was the outlier.

---

## 2. Button hierarchy improvements

| Order | Action | Visual treatment |
|---|---|---|
| 1 | **Continue as Guest** | Unchanged outline / soft primary fill (`border-2 border-primary`) |
| 2 | **Continue with Google** | Unchanged secondary control; disabled + quieter hint when OAuth unavailable |
| 3 | **Sign In with Email** | Now **primary filled** (`bg-primary`, white text, `h-12`, `rounded-lg`) |
| 4 | **Create Account** | Single text link at bottom of auth card |

Previously, “Continue with Email” used a neutral bordered surface and read as secondary while Guest looked primary — inverted for environments without Google.

Expanded email form submit remains **Sign In** via `AuthSubmitButton` (already primary).

---

## 3. Typography changes

| Element | Change |
|---|---|
| Email reveal CTA label | `Continue with Email` → **`Sign In with Email`** |
| Account creation | Retained **Create Account**; removed **Sign Up** |
| Google unavailable hint | `text-xs` → `text-[11px] leading-snug` + slightly softer opacity (less competing with primary CTA) |
| Welcome / tagline / guest copy | Unchanged |

Terminology alignment on this screen: **Sign In** / **Sign In with Email** for email auth; **Continue as Guest** / **Continue with Google** for alternate continues; **Create Account** for registration.

---

## 4. Visual hierarchy rationale

1. Guest stays first and distinct (browse without account).  
2. Google stays available as a secondary path when configured; when not, it stays visible but de-emphasized so it does not compete with email.  
3. Email is the reliable primary auth method (especially without Google) — filled brand blue matches `AuthSubmitButton` and other FixNow primary CTAs.  
4. One create-account link ends the card — no competing footer duplicate.

---

## 5. Mobile validation

- Auth card still uses `AuthShell` `max-w-[420px]`, `p-8`, `space-y-5` stack.  
- Removing the external footer eliminates the large `mt-8` footer gap and duplicate link below the card (as in the audit screenshot).  
- Primary email button: `h-12` / `min-h-12` (≥44px touch target).  
- Guest / Google keep `min-h-12`.  
- Safe-area / Capacitor layout unchanged (same shell).

---

## 6. Desktop validation

- Same single-column centered shell; no breakpoint-specific layout changes.  
- Card height shrinks naturally without the footer block.  
- Button spacing remains `space-y-5` inside the card.

---

## 7. Screens affected

| File | Change |
|---|---|
| `apps/customer/pages/LoginPage.tsx` | Removed Sign Up footer; primary email CTA rename + styles |
| `packages/shared/auth/ContinueWithGoogleButton.tsx` | Quieter unavailable-hint styling only (shared; behaviour unchanged) |

**Not changed:** auth APIs, `login` / Google handlers, routes, Guest flow, Register page, Technician login.

---

## Validation checklist

| Check | Status |
|---|---|
| Only one Create Account entry | ✓ |
| No duplicated auth destinations | ✓ |
| Email Sign-In visually primary | ✓ |
| Guest access unchanged | ✓ |
| Google Sign-In behaviour unchanged | ✓ |
| Auth functionality / routing unaffected | ✓ |
| Web + Android share same SPA screen | ✓ |

---

*Implementation complete: clean Customer login flow with one account-creation action and a clearly primary email Sign-In control.*
