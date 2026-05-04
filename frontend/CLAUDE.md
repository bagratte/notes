# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Vite dev server on :5173 (proxies /api → localhost:8000)
npm run build      # tsc -b && vite build
npx tsc --noEmit   # type-check only, no emit
```

There is no test suite or linter configured.

## Target platform

The app targets **touch-only devices** (tablets, iPads) as the primary platform:
- Minimum tap target: 44px — use `@media (pointer: coarse)` for touch-specific sizing
- Never rely on `:hover` for functionality — actions hidden by hover must also be accessible on touch
- Use pointer events throughout (not mouse/touch events)
- Sidebar overlays content on touch (`position: fixed`) rather than pushing it

## Architecture

### Routing

Three routes, all nested under `AppLayout` (sidebar + `<Outlet />`):

| Route | Page | Purpose |
|-------|------|---------|
| `/notes/:noteId` | `NotePage` | Standalone note editor |
| `/documents/:documentId` | `DocumentPage` | Document viewer |
| `/folders/:folderId` | `FolderPage` | Folder contents (notes + documents + subfolders) |
| `/settings` | `SettingsPage` | App-wide drawing settings |

Creating or clicking a region navigates to `/notes/:noteId`, replacing the document view.

### API client

`src/api/client.ts` wraps `fetch` with typed helpers (`get`, `post`, `patch`, `delete`, `postForm`). All methods prepend `/api`, which Vite proxies to `http://localhost:8000`. The exports in `src/api/index.ts` are domain-grouped (e.g. `strokes.create(...)`, `regions.list(...)`).

The `Sidebar` loads all folders, notes, and documents in a single `Promise.all` on mount — there is no lazy per-folder fetching.

### Drawing

`DrawingCanvas` is the generic drawing component; `DocumentOverlay` is a variant used inside document viewers that also handles the region drag-rectangle mode.

**Hybrid Canvas2D + SVG rendering:** Completed strokes are rendered as SVG `<path>` elements (persistent, resolution-independent). The in-progress stroke (while the pen is down) renders to a `<canvas>` overlay positioned on top of the SVG — this avoids the per-frame SVG DOM mutation cost and keeps latency low. On pointer-up the canvas is cleared and the finalized stroke is added to the SVG.

Strokes are stored as `[x, y, pressure][]` tuples in **natural page coordinates** (scale 1.0). The SVG `viewBox` is set to `"0 0 W H"` matching the natural size, so the browser handles scaling at any zoom. Input coordinates are converted:

```ts
const scaleX = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
const x = (e.clientX - rect.left) * scaleX;
```

`perfect-freehand` turns the point array into a smooth filled path via `getStroke` + `svgPathFromStroke` (`src/components/Canvas/utils.ts`).

### DrawingSettings context

`src/context/DrawingSettings.tsx` provides five algorithm parameters consumed by `DrawingCanvas` and `DocumentOverlay`:

| Setting | Type | Default | Effect |
|---------|------|---------|--------|
| `streamline` | `number` 0–0.5 | 0.1 | Cursor-lag smoothing (0 = exact, 0.5 = max lag) |
| `thinning` | `number` 0–1 | 0.5 | Pressure-based width variation |
| `smoothing` | `number` 0–1 | 0.5 | Stroke outline smoothness |
| `simulatePressure` | `boolean` | false | Infer pressure from velocity when hardware pressure unavailable |
| `predictive` | `boolean` | false | Draw ahead of pen tip using `getPredictedEvents()` |

Settings are persisted to `localStorage` as JSON under key `"drawingSettings"`. The context provides `{ settings, update(patch), reset() }`.

Both drawing components read these via refs (same pattern as `colorRef`/`penWidthRef`) so stale closures in `useCallback` event handlers always see current values. Changing any render-affecting setting (all except `predictive`) also clears `strokePathCache` so completed strokes are redrawn with the new parameters.

### Undo / redo

`SectionCanvas` and both document viewers maintain a local `Stroke[]` array with IDs (returned by `strokes.create`). Undo calls `strokesApi.delete(last.id)` and pushes to a `redoStack`; redo re-calls `strokesApi.create` and stores the new ID. A new stroke clears the redo stack. The `_redoStack` variable uses the `_` prefix because it is only read via the functional form of `setRedoStack`; TypeScript's `noUnusedLocals` would otherwise reject it.

### DjVu global

`DjVu.js` is not an ES module. `public/djvu.js` is a pre-built IIFE that sets `window.DjVu`. It is loaded via a plain `<script>` tag in `index.html` before the React bundle. Type declarations are in `src/types/djvu.d.ts`. Do not attempt to `import` it.

### Region enrichment

The backend `Region` type has `section_id` but not `note_id`. The document viewers enrich regions at load time by fetching each section (`sectionsApi.get(r.section_id)`) to obtain its `note_id`, producing the frontend-only `EnrichedRegion` type (`DocumentOverlay.tsx`). This is a parallel `Promise.all` fetch, not a backend join.

When `RegionLinkModal` confirms a link it first calls `sectionsApi.create` to add a new section to the target note, then `regionsApi.create` linking that section to the drawn rectangle. Navigating to the note after linking is intentional — the new section needs to be visible immediately.

### Document viewer architecture

`DocumentViewer/` is split into four layers:

| File | Role |
|------|------|
| `viewerTypes.ts` | Shared interfaces (`ViewerProps`, `NaturalSize`, `PendingRegion`, `ViewportSize`, `PanState`), constants (`ZOOM_STEPS`, `WINDOW_BUFFER`, `PAGE_GUTTER`, `PAN_DEADZONE_PX`, `PAGE_FALLBACK_WIDTH/HEIGHT`), and pure helpers (`toStrokeData`, `getDisplayScale`) |
| `useDocumentViewer.ts` | Custom hook `useDocumentViewer` — owns all shared state, refs, and handlers (zoom, pan, undo/redo, strokes, regions, page navigation, scroll sync). Exposes `setNumPages`, `setNaturalSizes`, `setPageLabels`, `setLoading`, `setError` so format-specific loading effects can feed data in. |
| `ViewerShell.tsx` | Shared UI: toolbar, page list, `DocumentOverlay` per page. Accepts the full `UseDocumentViewerResult` spread as props plus a render-page callback. |
| `PdfViewer.tsx` / `DjvuViewer.tsx` | Thin wrappers. Each calls `useDocumentViewer`, adds format-specific loading/rendering effects (pdf.js or DjVu.js), and renders `<ViewerShell>` with a format-specific `renderPage` callback. |

The key design constraint: PDF preloads natural sizes asynchronously before setting `numPages`, while DjVu sets both synchronously. The hook therefore accepts `numPages`/`naturalSizes` as settable state rather than computing them itself.

### Tool modes

`ToolMode = "auto" | "hand" | "pen" | "stroke-eraser" | "segment-eraser" | "select-region"` (defined in `src/types/index.ts`).

Tools are split across two toolbar components:

- **`CanvasToolbar`** (`src/components/CanvasToolbar/`) — canvas-level tools: `auto`, `hand`, `pen`, `stroke-eraser`, `segment-eraser`, plus colour swatches and stroke-width buttons. Used in both the note editor and document viewer.
- **`DocumentToolbar`** (`src/components/DocumentToolbar/`) — document-level tools: `select-region`. Used only in document viewers (`ViewerShell`).

`UndoRedoBar` (`src/components/UndoRedoBar/`) is rendered alongside both toolbars in the document viewer; the note editor has no undo/redo bar.

In `"hand"` mode the SVG overlay has `pointerEvents: none`; region `<div>`s become clickable. In all drawing/erasing modes the SVG captures pointer events and region divs get `pointerEvents: none`. In `"select-region"` mode dragging produces a pending selection rectangle; a contextual menu then lets the user create a linked note. `"auto"` mode treats stylus input as `"pen"` and finger/touch as pan, detected at pointer-down time.

Hardware barrel-button overrides (`getPenHwOverride`) fire `onHwOverrideChange` callbacks up to `CanvasToolbar` so the overriding tool is highlighted in amber (`activeOverride` prop) without changing the selected `ToolMode`.

### Keyboard shortcuts

| Key | Scope | Action |
|-----|-------|--------|
| `Escape` | Document viewers | Dismiss pending region selection |
| `←` / `→` | Document viewers (`auto` mode only) | Previous / next page |
| `Ctrl+Z` | Document viewers, note sections (hovered) | Undo last stroke |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Document viewers, note sections (hovered) | Redo |

Note section shortcuts are active only while the cursor is over that section (`onMouseEnter`/`onMouseLeave` set a `hovered` flag; the `keydown` listener is added/removed accordingly).

### Touch mode

`TouchModeProvider` (`src/context/TouchMode.tsx`) wraps the entire app and exposes `{ isTouch, toggle }` via `useTouchMode()`. The value is persisted to `localStorage` and the `has-touch` class is toggled on `<html>` so CSS can target it. The sidebar toggle button calls `toggle()`; CSS rules keyed on `.has-touch` adjust tap-target sizes, show/hide controls, and switch the sidebar to overlay mode.

### MergeModal

`MergeModal` (`src/components/MergeModal.tsx`) lets the user merge all sections of the current note into another note. It is opened from the note title bar. On confirm it calls the merge API, navigates to the target note, and fires `sidebar:refresh` so the sidebar removes the now-deleted source note.

### Cross-component events

Two `window` custom events keep the sidebar and document viewers in sync without a shared store:

| Event | `detail` | Fired by | Listened by |
|-------|----------|----------|-------------|
| `sidebar:refresh` | — | PdfViewer/DjvuViewer (region created), MergeModal (note merged) | Sidebar — full reload |
| `document:page-strokes-changed` | `{ documentId, pageNumber }` | PdfViewer/DjvuViewer (first/last stroke on page), Sidebar (page strokes deleted) | Sidebar — re-fetches `annotatedPages` for that doc; PdfViewer/DjvuViewer — reloads strokes if currently on that page |

Fire `sidebar:refresh` for mutations that change the note/document/folder tree. Fire `document:page-strokes-changed` for mutations that change whether a document page has inline strokes. The `document:page-strokes-changed` event is only dispatched when a page crosses the zero-stroke boundary (empty → first stroke, or last stroke → empty).

### TypeScript config notes

`strict`, `noUnusedLocals`, and `noUnusedParameters` are all enabled. Prefix intentionally unused variables with `_` to satisfy the compiler.

The `@/` path alias maps to `src/`.
