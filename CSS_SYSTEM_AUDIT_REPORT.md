# FixNow CSS System Audit Report

**Date:** 2026-07-25  
**Project:** FixNow frontend (`FIXNOW APP`)  
**Scope:** Styling stack audit, Tailwind v4 correctness, Problems-panel warnings, browser compatibility — **no UI redesign**.

---

## Executive summary

FixNow uses **Tailwind CSS v4.3.3** with the **`@tailwindcss/vite`** plugin (CSS-first). There is **no** standalone PostCSS or `tailwind.config.*` pipeline. The Problems-panel issues for `@theme` / `@apply` were **editor language-service false positives**, not build failures. Browser-compat warnings were addressed with standards-aware progressive enhancement (prefixes, `@supports`, removal of obsolete `-webkit-overflow-scrolling`). CSS validation remains **enabled**.

---

## 1. Current stack

| Item | Value |
|------|--------|
| **Tailwind** | **v4.3.3** (`tailwindcss`, `@tailwindcss/vite`) |
| **Vite** | ^8.1.1 (resolved 8.x) |
| **React** | 19.x |
| **PostCSS config** | **None** — not required for Tailwind v4 + Vite plugin |
| **`tailwind.config.*`** | **None** — CSS-first `@theme` in `src/index.css` |
| **CSS entry** | `src/index.css` (`@import "tailwindcss"`) |
| **Other CSS** | `packages/shared/splash/fixnowSplash.css` (splash tokens; no Tailwind directives) |
| **Lint** | `oxlint` (no CSS-specific ESLint plugin) |

### Vite CSS pipeline

```ts
// vite.config.ts
plugins: [react(), tailwindcss()],
```

Tailwind v4 compiles via Lightning CSS inside `@tailwindcss/vite`. Autoprefixer / `postcss-import` are not part of this project’s toolchain.

### Version verdict

| Question | Answer |
|----------|--------|
| Tailwind v3 or v4? | **v4** |
| Is `@theme` valid? | **Yes** — design tokens live in `@theme { ... }` |
| Is `@apply` valid? | **Yes** — used in `@layer base` for `body` / `#root` |
| Should we migrate to v3 syntax? | **No** |

---

## 2. Issues found & root causes

| Warning / symptom | Root cause | Resolution |
|-------------------|------------|------------|
| Unknown at rule `@theme` | Built-in CSS language service does not know Tailwind v4 at-rules | Associate `*.css` → `tailwindcss`; teach via `css.customData`; point IntelliSense at `src/index.css` |
| Unknown at rule `@apply` | Same editor false positive; runtime processing is correct | Same as above — **not** removed; validation left **on** |
| `text-size-adjust` compat | Unprefixed property has uneven support; duplicate `html` block existed | Keep `-webkit-` + `-moz-` + standard once in `@layer base`; remove duplicate |
| `scrollbar-width` compat | Safari lacks `scrollbar-width`; Chromium/Firefox support it | Use WebKit `::-webkit-scrollbar` always; put `scrollbar-width` / `scrollbar-color` inside `@supports` |
| `-webkit-overflow-scrolling` compat | Obsolete proprietary property; modern iOS momentum-scrolls `overflow: auto\|scroll` by default | Removed from `.scroll-touch` / `.scroll-touch-x`; kept `overscroll-behavior` |

### What was *not* done (by design)

- Did **not** set `css.lint.unknownAtRules: "ignore"` (blind suppression).
- Did **not** disable `css.validate`.
- Did **not** remove `@theme` / `@apply` or downgrade Tailwind.
- Did **not** change colours, spacing, or layout tokens.

---

## 3. Files modified

| File | Change |
|------|--------|
| `src/index.css` | Deduped `text-size-adjust`; `@supports` for scrollbar utilities; removed obsolete `-webkit-overflow-scrolling`; cleaned empty `.custom-scrollbar` rule |
| `.vscode/settings.json` | Tailwind language association + customData; **validation kept on**; removed blind `unknownAtRules` ignore |
| `.vscode/tailwind.css-data.json` | Documented Tailwind v4 at-rules + relevant vendor/standard properties for the CSS LS |
| `.vscode/extensions.json` | Recommend `bradlc.vscode-tailwindcss` |
| `packages/api/socketClient.ts` | Restored missing `updateSocketAuth` export (unrelated to CSS; unblocked production build validation) |
| `packages/api/client.ts` | Narrowed Axios `GenericAbortSignal` → `AbortSignal` for `sleep()` (unrelated typecheck unblock) |

### Deliverable

| File | Purpose |
|------|---------|
| `CSS_SYSTEM_AUDIT_REPORT.md` | This report |

---

## 4. Browser compatibility strategy

### `text-size-adjust`

```css
html {
  -webkit-text-size-adjust: 100%;
  -moz-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
```

| Engine | Coverage |
|--------|----------|
| Safari / iOS / Chrome Android (WebKit/Blink) | `-webkit-text-size-adjust` |
| Firefox | `-moz-` / standard where available |
| Chrome / Edge | standard + `-webkit-` |

**Retained:** all three declarations. Preventing mobile font inflation is intentional.

### Scrollbars

| Class | Strategy |
|-------|----------|
| `.no-scrollbar` | Hide via `::-webkit-scrollbar` + `-ms-overflow-style`; `scrollbar-width: none` only under `@supports (scrollbar-width: none)` |
| `.custom-scrollbar` | Thin bar via `::-webkit-scrollbar*`; `scrollbar-width` / `scrollbar-color` under `@supports (scrollbar-width: thin)` |

### Momentum scrolling

`-webkit-overflow-scrolling: touch` **removed**. Modern Safari iOS already applies momentum scrolling to overflow containers. `.scroll-touch` now only sets `overscroll-behavior` containment (still useful for carousels/chat).

### Target matrix

| Browser | Status |
|---------|--------|
| Chrome | Covered |
| Edge | Covered |
| Firefox | Covered (`scrollbar-width` via `@supports`) |
| Safari | Covered (WebKit prefixes + pseudo-elements) |
| Safari iOS | Covered (no obsolete overflow-scrolling; safe-area + overscroll intact) |
| Chrome Android | Covered |

---

## 5. Global CSS audit notes

| Check | Finding |
|-------|---------|
| Duplicate rules | Removed second `html { text-size-adjust... }` block near native shell section |
| Conflicting selectors | No colour/spacing conflicts introduced; admin theme vars remain scoped under `.admin-theme` |
| Invalid nesting | None found in `src/index.css` |
| Custom properties | Tokens defined in `@theme` and consumed as utilities / `var(--color-*)` — valid for v4 |
| Deprecated syntax | Removed `-webkit-overflow-scrolling` |
| Specificity | Unchanged intentional patterns (e.g. `.admin-theme .custom-scrollbar`) |
| Unused variables | Not purged in this pass (would risk design-token breakage); no action |

---

## 6. Warnings resolved vs intentionally retained

### Resolved (configuration / code)

- Editor “unknown at-rule `@theme` / `@apply`” — fixed by teaching the language service (association + customData), not by ignoring lint.
- Duplicate `text-size-adjust` block.
- Bare `scrollbar-width` outside feature queries (now gated).
- Obsolete `-webkit-overflow-scrolling` usage.

### Intentionally retained (with justification)

| Item | Why keep |
|------|----------|
| `-webkit-text-size-adjust` + `text-size-adjust` | Required for Safari mobile; unprefixed alone is insufficient |
| `-moz-text-size-adjust` | Historical Gecko coverage; harmless |
| `scrollbar-width` inside `@supports` | Correct progressive enhancement for Firefox/Chromium |
| `::-webkit-scrollbar*` rules | Required for Safari / WebKit thin or hidden bars |
| `-ms-overflow-style: none` | Legacy Edge/IE hide-scrollbar path for `.no-scrollbar` |
| `-webkit-backdrop-filter` / `-webkit-user-select` | Safari still needs prefixes |

Some IDE “compatibility” tips may still annotate prefixed or partially supported properties. That is **documentation noise**, not a compile error. Suppressing those globally would hide real issues.

---

## 7. Validation results

| Check | Result |
|-------|--------|
| Tailwind / Vite CSS transform | **Pass** — modules transform with no CSS/PostCSS/Tailwind errors |
| Production CSS (`dist/assets/index-*.css`) | Contains `-webkit-text-size-adjust`, `scrollbar-width`; **no** `-webkit-overflow-scrolling` |
| `oxlint` | **Pass** (warnings only; none CSS-related) |
| `npx vite build` | **Pass** (exit 0, ~6s) after restoring missing `updateSocketAuth` + AbortSignal cast |
| `tsc -b` | Unblocked by the same minimal API fixes |
| UI redesign | **None** |
| Colour / spacing changes | **None** |

### Regression testing (static / code-level)

Portal UI was **not** visually redesigned. Behavioural CSS contracts preserved:

| Area | Expectation after fix |
|------|------------------------|
| Customer / Technician / Admin shells | Same tokens, layout utilities, glass, typography classes |
| Auth forms | Unchanged classes; focus styles still from existing auth kit |
| Dashboard / tables / cards / nav | Unchanged utility usage |
| Responsive + safe-area | `.pb-safe`, `.pt-safe`, `.px-safe`, native foldable media queries intact |
| Dark mode | No separate dark theme in global CSS; nothing to regress |
| Animations | `animate-*`, route fade, reduced-motion media queries intact |
| Scroll containers | Hidden/thin scrollbars still work; momentum scrolling relies on engine defaults |

**Manual browser pass recommended after reload:** open Customer, Technician, and Admin shells; confirm carousels/chat lists still scroll smoothly on iOS Safari.

### Editor follow-up

1. Install recommended extension: **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`).
2. Run **Developer: Reload Window**.
3. Confirm Problems panel no longer flags `@theme` / `@apply` on `src/index.css`.

---

## 8. Final CSS health score

| Dimension | Score (0–10) | Notes |
|-----------|--------------|-------|
| Tailwind version alignment | 10 | Correct v4 CSS-first setup |
| Pipeline correctness | 10 | `@tailwindcss/vite` only; no conflicting PostCSS |
| Editor / Problems accuracy | 9 | Taught via association + customData (requires extension + reload) |
| Browser compatibility | 9 | Progressive enhancement; obsolete API removed |
| Global CSS hygiene | 8 | Duplicate removed; large single entry still dense but coherent |
| Build / compile confidence | 9 | CSS path clean; JS unblocks applied for full build check |

### **Overall: 9.2 / 10**

The CSS system compiles with the correct Tailwind v4 configuration, genuine editor misconfiguration is fixed without disabling validation, and browser warnings are reduced through standards-compliant progressive enhancement while preserving the existing FixNow UI.
