# AUTHENTICATION FLOW UX IMPROVEMENT REPORT

**Date:** 2026-07-29  
**Scope:** Customer + Technician login screens  
**Constraint:** No auth logic, API, routing, or full visual redesign — interaction order and hierarchy only.

---

## 1. Previous interaction flow

### Customer

1. Continue as Guest (top, strong outline)  
2. Continue with Google (+ unavailable hint)  
3. Continue with Email / form **replaced** the Email button when opened (fields appeared where the button was)  
4. Duplicate create-account paths (card + footer historically; footer already removed)

### Technician

1. Continue with Google  
2. Continue with Email (secondary styling) / form replaced the Email button  
3. Create Account in card **and** AuthShell footer  

---

## 2. Updated interaction flow

### Customer (top → bottom)

1. **Sign In with Email** (primary filled)  
   → Tap toggles credentials **below** the button  
   → Remember Me / Forgot password  
   → **Sign In** submit  
2. **Continue with Google** (secondary; disabled messaging unchanged)  
3. **New here? Create Account** (single link)  
4. **Continue as Guest** (outline fallback)

### Technician (top → bottom)

1. **Sign In with Email** (primary filled) + expand-below form  
2. **Continue with Google**  
3. **New technician? Create Account** (single link; footer duplicate removed)  
4. *(No Guest — unchanged product rule)*

---

## 3. Components modified

| Component | Role |
|---|---|
| `packages/shared/auth/authUx.ts` | Shared button + expand panel classes |
| `packages/shared/auth/ContinueWithGoogleButton.tsx` | Matching secondary typography |
| `packages/shared/auth/AuthSubmitButton.tsx` | Matching submit typography |
| `apps/customer/pages/LoginPage.tsx` | Reorder + expand-below |
| `apps/technician/pages/LoginPage.tsx` | Reorder + expand-below + single Create Account |

---

## 4. Customer implementation

- Email CTA always visible; `aria-expanded` / `aria-controls` wired.  
- Credentials live in a `grid-rows` expand panel under the CTA (`authExpandPanelClass`).  
- Guest moved to bottom with `authActionOutlineClass`.  
- Welcome subcopy updated to: “Sign in to book and manage jobs, or browse as a guest.”  
- Auth handlers / navigation / guest session APIs unchanged.

---

## 5. Technician implementation

- Same Email-first + expand-below pattern.  
- Google second.  
- One Create Account link; AuthShell `footer` removed to avoid duplication.  
- Label shortened to **Create Account** for consistency with Customer (still routes to `/technician/register`).  
- No Guest control (intentional).

---

## 6. Animation behaviour

- Expand/collapse via CSS `grid-template-rows: 0fr → 1fr` over **200ms** `ease-out`.  
- Inner `overflow-hidden` avoids abrupt jumps.  
- `motion-reduce:transition-none` on the panel class.  
- No page reload; toggle is local React state only.

---

## 7. Mobile validation

- Single-column AuthShell card; order matches thumb-scroll reading.  
- Primary Email CTA first; Guest last on Customer.  
- Expand grows downward so the Email button does not jump upward out of view.  
- Capacitor WebView uses the same SPA pages.

---

## 8. Desktop validation

- Same centered `max-w-[420px]` shell; no breakpoint-specific layout forks.  
- Balanced vertical spacing (`space-y-5` / `space-y-3` around Email block).

---

## Validation checklist

| Check | Status |
|---|---|
| Email Sign-In is first | ✓ |
| Google below Email | ✓ |
| Only one Create Account link | ✓ Customer & Technician |
| Guest is last (Customer) | ✓ |
| Email fields render below Email action | ✓ |
| Sign In submit below inputs | ✓ |
| Customer & Technician share pattern | ✓ (Guest only on Customer) |
| Auth logic / APIs / routes unchanged | ✓ |

---

*Companion: `LOGIN_BUTTON_TYPOGRAPHY_AUDIT.md` documents typography unification.*
