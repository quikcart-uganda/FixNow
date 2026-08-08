# CSS Compatibility Report

**Date:** 2026-07-24  
**Project:** FixNow frontend (`FIXNOW APP`)  
**Scope:** Safari vendor prefixes, Tailwind audit, VS Code Tailwind lint config, cross-browser scrollbars — **no intentional UI/design changes**.

---

## 1. Tailwind version

| Item | Finding |
|------|---------|
| **Version** | **Tailwind CSS v4.3.3** |
| Evidence | `package.json` → `"tailwindcss": "^4.3.3"`, `"@tailwindcss/vite": "^4.3.3"`; `npm ls` resolves both to `4.3.3` |
| Integration | Vite plugin `@tailwindcss/vite` in `vite.config.ts` |
| Config style | **CSS-first (v4)** — no `tailwind.config.js` / `tailwind.config.ts` |
| Entry | `src/index.css` starts with `@import "tailwindcss";` and uses `@theme { ... }` |
| Directives in use | `@import`, `@theme`, `@layer`, `@apply` |

**Verdict:** Configuration is valid for Tailwind v4. Theme tokens live in `@theme`; utilities/base live in `@layer`. No PostCSS `tailwindcss` / `autoprefixer` pipeline is required because `@tailwindcss/vite` (Lightning CSS) compiles CSS. Manual Safari prefixes were still added on custom rules for explicit coverage.

---

## 2. Changes made

### 2.1 Safari / vendor prefixes (`src/index.css`)

| Property | Location | Prefixes |
|----------|----------|----------|
| `text-size-adjust` | `html` in `@layer base` | `-webkit-`, `-moz-`, standard (`100%`) |
| `user-select` | `.material-symbols-outlined` | `-webkit-`, `-moz-`, `-ms-`, standard (`none`) |
| `backdrop-filter` | `.glass-effect` | `-webkit-backdrop-filter` + `backdrop-filter: blur(8px)` |

### 2.2 Appearance prefixes (`packages/shared/splash/fixnowSplash.css`)

| Property | Location | Prefixes |
|----------|----------|----------|
| `appearance` | `.fixnow-splash-btn` | `-webkit-appearance`, `-moz-appearance`, `appearance: none` |

### 2.3 Cross-browser scrollbar styling (`src/index.css`)

| Class | Coverage |
|-------|----------|
| `.no-scrollbar` | WebKit (`display: none` + `width/height: 0`), IE/legacy Edge (`-ms-overflow-style: none`), Firefox (`scrollbar-width: none`) |
| `.custom-scrollbar` | Available globally (not only under `.admin-theme`); Firefox `scrollbar-width: thin` / `scrollbar-color: #e2e8f0 transparent`; WebKit 4px thumb matching existing `#e2e8f0` / hover `#cbd5e1` |

**Not done on purpose:** global `*` scrollbar restyling — that would change default OS scrollbars and violate “no UI change.”

### 2.4 VS Code / Cursor Tailwind false-warning config

| File | Purpose |
|------|---------|
| `.vscode/settings.json` | Associate `*.css` → `tailwindcss`; ignore unknown at-rules; point IntelliSense at `src/index.css`; enable class suggestions in TS/TSX |
| `.vscode/tailwind.css-data.json` | Custom CSS data for `@theme`, `@apply`, `@utility`, `@layer`, `@source`, `@plugin`, `@custom-variant`, `@variant`, `@config`, `@reference`, etc. |
| `.vscode/extensions.json` | Recommend `bradlc.vscode-tailwindcss` |

After pulling these files: install the recommended extension and run **Developer: Reload Window**.

### 2.5 Build verification

`npm run build` completed successfully (`tsc -b && vite build`, exit code `0`).

Production CSS (`dist/assets/index-*.css`) contains: `-webkit-text-size-adjust`, `-webkit-user-select`, `-webkit-backdrop-filter`, `-webkit-appearance`, `scrollbar-width`, `scrollbar-color`.

---

## 3. Browser compatibility improvements

| Area | Browsers helped |
|------|-----------------|
| Text size adjust | Older Safari / iOS Safari (prevents unwanted font inflation) |
| User-select | Safari / legacy Edge |
| Backdrop-filter (glass + Tailwind `backdrop-blur*`) | Safari (requires `-webkit-backdrop-filter`) |
| Appearance (splash buttons) | Safari / Firefox |
| Hidden scrollbars | IE/legacy Edge (`-ms-`), Firefox (`scrollbar-width`), WebKit |
| Thin custom scrollbars | Firefox now matches admin WebKit thin bar |

Visual design tokens, gradients, spacing, and component layouts were not altered.

---

## 4. Remaining informational warnings

These are **not CSS compatibility failures**; they are build/editor notes:

1. **Vite chunk size:** Main JS bundle &gt; 500 kB — informational; unrelated to CSS.
2. **Ineffective dynamic imports:** `packages/api/client.ts` and `packages/api/reviewsApi.ts` — bundling notes; unrelated to CSS.
3. **npm notices:** `Unknown env config "devdir"` and npm major update notice — environment/tooling only.
4. **Built-in CSS language service:** If a file is opened as plain `css` instead of `tailwindcss`, `@theme` may still warn until workspace settings / Tailwind CSS IntelliSense are active.
5. **Autoprefixer package:** Not installed; not required for this Vite + Tailwind v4 setup. Manual prefixes cover the audited custom properties; Lightning CSS also emits vendor prefixes for many utilities in the build output.

---

## 5. Files touched

| File | Change |
|------|--------|
| `src/index.css` | Safari prefixes + cross-browser scrollbar rules |
| `packages/shared/splash/fixnowSplash.css` | Appearance prefixes on splash buttons |
| `.vscode/settings.json` | Tailwind / CSS lint workspace settings |
| `.vscode/tailwind.css-data.json` | Custom at-directive definitions for the CSS language service |
| `.vscode/extensions.json` | Recommend Tailwind CSS IntelliSense |
| `CSS_COMPATIBILITY_REPORT.md` | This report |

---

*End of report.*
