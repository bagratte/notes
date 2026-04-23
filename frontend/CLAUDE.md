# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Vite dev server on :5173 (proxies /api → localhost:8000)
npm run build      # tsc -b && vite build
npx tsc --noEmit   # type-check only, no emit
```

There is no test suite or linter configured.

## Architecture

### Routing

Three routes, all nested under `AppLayout` (sidebar + `<Outlet />`):

| Route | Page | Purpose |
|-------|------|---------|
| `/notes/:noteId` | `NotePage` | Standalone note editor |
| `/documents/:documentId` | `DocumentPage` | Document viewer |
| `/documents/:documentId/notes/:noteId` | `SideBySidePage` | Split view — document left, linked note right |

`SideBySidePage` owns `activeSectionId` state and passes it down to both panes. Clicking a region in the document pane sets `activeSectionId`; the note pane scrolls to the matching `[data-section-id]` element.

### API client

`src/api/client.ts` wraps `fetch` with typed helpers (`get`, `post`, `patch`, `delete`, `postForm`). All methods prepend `/api`, which Vite proxies to `http://localhost:8000`. The exports in `src/api/index.ts` are domain-grouped (e.g. `strokes.create(...)`, `regions.list(...)`).

The `Sidebar` loads all notebooks, folders, notes, and documents in a single `Promise.all` on mount — there is no lazy per-folder fetching.

### Drawing

All drawing surfaces are SVG. `DrawingCanvas` is the generic component; `DocumentOverlay` is a variant used inside document viewers that also handles the region drag-rectangle mode.

Strokes are stored as `[x, y, pressure][]` tuples in **natural page coordinates** (scale 1.0). The SVG `viewBox` is set to `"0 0 W H"` matching the natural size, so the browser handles scaling at any zoom. Input coordinates are converted:

```ts
const scaleX = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
const x = (e.clientX - rect.left) * scaleX;
```

`perfect-freehand` turns the point array into a smooth filled path via `getStroke` + `svgPathFromStroke` (`src/components/Canvas/utils.ts`).

### Undo / redo

`SectionCanvas` and both document viewers maintain a local `Stroke[]` array with IDs (returned by `strokes.create`). Undo calls `strokesApi.delete(last.id)` and pushes to a `redoStack`; redo re-calls `strokesApi.create` and stores the new ID. A new stroke clears the redo stack. The `_redoStack` variable uses the `_` prefix because it is only read via the functional form of `setRedoStack`; TypeScript's `noUnusedLocals` would otherwise reject it.

### DjVu global

`DjVu.js` is not an ES module. `public/djvu.js` is a pre-built IIFE that sets `window.DjVu`. It is loaded via a plain `<script>` tag in `index.html` before the React bundle. Type declarations are in `src/types/djvu.d.ts`. Do not attempt to `import` it.

### Region enrichment

The backend `Region` type has `section_id` but not `note_id`. The document viewers enrich regions at load time by fetching each section (`sectionsApi.get(r.section_id)`) to obtain its `note_id`, producing the frontend-only `EnrichedRegion` type (`DocumentOverlay.tsx`). This is a parallel `Promise.all` fetch, not a backend join.

When `RegionLinkModal` confirms a link it first calls `sectionsApi.create` to add a new section to the target note, then `regionsApi.create` linking that section to the drawn rectangle. Navigating to the note after linking is intentional — the new section needs to be visible immediately.

### Tool modes in document viewers

`ToolMode = "view" | "annotate" | "region"`. In `"view"` mode the SVG overlay has `pointerEvents: none`; region `<div>`s are clickable. In `"annotate"` and `"region"` modes the SVG captures all pointer events and region divs get `pointerEvents: none`. This separation is necessary because CSS `pointer-events: none` on an SVG parent prevents children from receiving events.

### Keyboard shortcuts

| Key | Scope | Action |
|-----|-------|--------|
| `A` | Document viewers | Toggle annotate mode |
| `R` | Document viewers | Toggle region mode |
| `Escape` | Document viewers | Return to view mode |
| `←` / `→` | Document viewers (view mode only) | Previous / next page |
| `Ctrl+Z` | Document viewers, note sections (hovered) | Undo last stroke |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Document viewers, note sections (hovered) | Redo |

Note section shortcuts are active only while the cursor is over that section (`onMouseEnter`/`onMouseLeave` set a `hovered` flag; the `keydown` listener is added/removed accordingly).

### TypeScript config notes

`strict`, `noUnusedLocals`, and `noUnusedParameters` are all enabled. Prefix intentionally unused variables with `_` to satisfy the compiler.

The `@/` path alias maps to `src/`.
