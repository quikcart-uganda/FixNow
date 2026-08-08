# CMS Article Detail Audit

**Date:** 2026-07-28  
**Module:** Admin → Content Management  
**Symptom:** Article list loads; selecting **Edit** (or **New article**) crashes into the global Admin error boundary (“We couldn't display this admin page”).

---

## Verdict

**Root cause is a frontend React crash**, not routing, API, Mongo, permissions, or media.

`ContentIconPicker` referenced an undefined variable `id` (`id={id}`), throwing:

```text
ReferenceError: id is not defined
    at ContentIconPicker (apps/admin/components/cms/ContentIconPicker.tsx)
```

That component mounts inside the article **editor** dialog. Preview-only (card tap / Preview button) did **not** crash because it never mounts `ContentIconPicker`.

---

## Reproduction (confirmed)

| Step | Result |
|---|---|
| Open `/admin/content` Knowledge Base | List OK (18 articles) |
| Preview Help Centre | Dialog + body render OK |
| **Edit** Help Centre | **Crash** → `AppErrorBoundary` |
| After fix: Edit Help Centre | Editor opens with title, markdown, tags, live preview |
| After fix: Legal → Edit Privacy Policy | Editor opens with full legal markdown + preview |

**Network:** List uses `GET /admin/content` successfully. Edit path does **not** call `GET /admin/content/:id` — it hydrates the editor from the list row. No failing endpoint.

**Backend / Mongo:** Not involved in the crash. Seeded articles contain title, slug, bodyMarkdown/bodyHtml, keywords, status, etc.

---

## Flow trace

```
Article card Edit / New article / Overflow → Edit
  → openEdit(row) | openCreate()
  → setEditor(...)
  → ContentPage renders editor dialog
  → ContentIconPicker mounts
  → ReferenceError: id is not defined   ← failure point
  → bubbles to SectionErrorBoundary / AppErrorBoundary
```

Preview path:

```
Card image / Preview / Overflow → Open|Preview
  → setPreviewPage(row)
  → LivePreview only
  → OK (no ContentIconPicker)
```

**Routing:** Single route `/admin/content` (no slug/id detail route). Identifier mismatch (slug vs `_id`) was **not** the issue.

---

## Findings by audit step

| Step | Finding |
|---|---|
| Routing | No mismatch; in-page editor state, not a detail URL |
| Backend | `GET /admin/content` OK; edit does not require get-by-id for open |
| Mongo | No missing-required-field crash |
| Media | Hero images optional; LazyImage placeholders OK |
| Rich text | `bodyHtml` / markdown preview OK; hardened with try/catch |
| React | **Root cause:** undefined `id` in `ContentIconPicker` |
| Permissions | Admin session valid; list + publish APIs reachable |
| Error handling | Global boundary caught crash; local dialog boundaries added |

---

## Stack trace summary

```text
ReferenceError: id is not defined
  at ContentIconPicker (...)
  … React render …
  The above error occurred in the <ContentIconPicker> component.
  React will try to recreate this component tree from scratch using
  the error boundary you provided, AppErrorBoundary.
```

Console also logged: `[FixNow] Uncaught UI error` with the same message.

---

## Fixes applied

1. **`ContentIconPicker.tsx`** — `useId()` → `triggerId`; button uses `id={triggerId}`; label uses `htmlFor={triggerId}`. Removed undefined `id`.
2. **Catalogue** — added `article` icon so default editor icon resolves in the picker.
3. **`ContentPage.tsx` `openEdit`** — safe keywords/title/status defaults (no `.join` on non-arrays).
4. **`LivePreview.tsx`** — sanitize/markdown wrapped in try/catch so malformed HTML cannot crash preview.
5. **Local `AppErrorBoundary`** around editor and preview dialogs with title “Unable to load article” and reset closing the dialog — list stays usable if a future editor bug appears.

---

## Validation

| Surface | Result |
|---|---|
| Knowledge Base → Edit | Pass (after fix) |
| Knowledge Base → Preview | Pass (before and after) |
| Legal → Edit Privacy Policy | Pass |
| Desktop Admin SPA | Pass |
| Mobile viewport (user report path) | Same root cause; Edit mounts picker on all breakpoints |

---

## Files touched

- `apps/admin/components/cms/ContentIconPicker.tsx`
- `apps/admin/components/cms/LivePreview.tsx`
- `apps/admin/pages/ContentPage.tsx`
- `CMS_ARTICLE_DETAIL_AUDIT.md` (this file)

---

## Success criteria

Opening any CMS article for **edit** or **create** no longer throws. Preview continues to work. Missing/invalid body content cannot take down the whole Admin page via the picker bug; dialog-scoped boundaries keep the list available if something else fails later.
