# LOGIN BUTTON TYPOGRAPHY AUDIT

**Date:** 2026-07-29  
**Scope:** Customer + Technician login screens; shared Google / Auth submit controls  
**Constraint:** Typography and visual consistency only — auth logic unchanged.

---

## 1. Previous typography

| Control | Font size | Weight | Height | Radius |
|---|---|---|---|---|
| Continue as Guest | `text-sm` (14px) | `font-bold` (700) | `min-h-12` | `rounded-xl` |
| Continue with Google | **`text-title-md` (20px)** | `font-semibold` (600) | `min-h-12` + `py-3` | `rounded-lg` |
| Sign In with Email | `text-sm` (14px) | `font-bold` (700) | `h-12` | `rounded-lg` |
| Auth submit **Sign In** | **`text-title-md` (20px)** | inherited / bold title | `h-12` | `rounded-lg` |
| Create Account link | `text-sm` | `font-bold` on link | — | — |

**Issue:** Google (and form Sign In) used `text-title-md` (20px / 600), so Google label looked oversized next to Guest and Email (`text-sm` / 700).

---

## 2. Updated typography

Shared tokens in `packages/shared/auth/authUx.ts`:

| Token | Spec |
|---|---|
| `authActionButtonBase` | `h-12`, `text-sm font-bold`, `gap-2`, `rounded-lg`, `px-4` |
| `authActionPrimaryClass` | Primary fill (Email CTA) |
| `authActionSecondaryClass` | Border / white (Google) |
| `authActionOutlineClass` | Primary outline (Guest) |

| Control | Font size | Weight | Height | Radius |
|---|---|---|---|---|
| Sign In with Email | `text-sm` | `font-bold` | `h-12` | `rounded-lg` |
| Continue with Google | **`text-sm`** | **`font-bold`** | `h-12` | `rounded-lg` |
| Create Account | `text-sm` | `font-bold` on link | — | — |
| Continue as Guest | `text-sm` | `font-bold` | `h-12` | `rounded-lg` |
| Form **Sign In** | **`text-sm font-bold`** | 700 | `h-12` | `rounded-lg` |

Colours still differentiate primary / secondary / outline / disabled — not typography.

---

## 3. Components affected

| File | Change |
|---|---|
| `packages/shared/auth/authUx.ts` | Added shared auth action classes + expand helpers |
| `packages/shared/auth/ContinueWithGoogleButton.tsx` | Uses `authActionSecondaryClass` (no `text-title-md`) |
| `packages/shared/auth/AuthSubmitButton.tsx` | `text-sm font-bold` |
| `packages/shared/auth/index.ts` / `packages/shared/index.ts` | Re-exports |
| `apps/customer/pages/LoginPage.tsx` | Shared classes + flow reorder (see companion report) |
| `apps/technician/pages/LoginPage.tsx` | Shared classes + flow reorder |

---

## 4. Validation results

| Check | Result |
|---|---|
| Google text no longer larger than Email / Guest | ✓ same `text-sm font-bold` |
| Same height / radius / padding across auth actions | ✓ `h-12` / `rounded-lg` / `px-4` |
| Google logo remains visual identifier | ✓ 18×18 mark unchanged |
| Disabled Google still quieter via opacity | ✓ |
| No auth logic / routing changes | ✓ |

---

## 5. Design consistency verification

- Auth actions now share one chrome recipe instead of one-off sizes.
- Aligns with FixNow button language (`text-sm` + bold/semibold action labels).
- Google logo size unchanged; text no longer competes as a display title.

---

*See also: `AUTHENTICATION_FLOW_UX_IMPROVEMENT_REPORT.md` for reorder / expand behaviour.*
