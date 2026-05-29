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

Four routes, all nested under `AppLayout` (sidebar + `<Outlet />`):

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

Each document row expands to show up to two collapsible supersections:
- **Contents** — TOC entries extracted from the document outline (`TocEntry[]`), hierarchically nested and individually collapsible. Auto-expands when the TOC loads. Only shown for documents that have been opened in the current session.
- **Notes** — linked notes (with page prefix) and inline-annotated pages. Collapsed by default.

### Drawing

`useDrawing` (`Canvas/useDrawing.ts`) is the custom hook that owns all pointer event handlers, stroke state, and the canvas/SVG render cycle. `DrawingCanvas` is a thin wrapper around it. `DocumentOverlay` is a separate variant that also calls `useDrawing` and adds the region drag-rectangle mode on top.

**Hybrid Canvas2D + SVG rendering:** Completed strokes are rendered as SVG `<path>` elements (persistent, resolution-independent). The in-progress stroke (while the pen is down) renders to a `<canvas>` overlay positioned on top of the SVG — this avoids the per-frame SVG DOM mutation cost and keeps latency low. On pointer-up the canvas is cleared and the finalized stroke is added to the SVG.

Strokes are stored as `[x, y, pressure][]` tuples in **natural page coordinates** (scale 1.0). The SVG `viewBox` is set to `"0 0 W H"` matching the natural size, so the browser handles scaling at any zoom. Input coordinates are converted:

```ts
const scaleX = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
const x = (e.clientX - rect.left) * scaleX;
```

`perfect-freehand` turns the point array into a smooth filled path via `getStroke` + `svgPathFromStroke` (`src/components/Canvas/utils.ts`).

### DrawingSettings context

`src/context/DrawingSettings.tsx` provides algorithm parameters consumed by `DrawingCanvas` and `DocumentOverlay`:

| Setting | Type | Default | Effect |
|---------|------|---------|--------|
| `streamline` | `number` 0–0.5 | 0.1 | Cursor-lag smoothing (0 = exact, 0.5 = max lag) |
| `thinning` | `number` 0–1 | 0.5 | Pressure-based width variation |
| `smoothing` | `number` 0–1 | 0.5 | Stroke outline smoothness |
| `simulatePressure` | `boolean` | false | Infer pressure from velocity when hardware pressure unavailable |
| `predictive` | `boolean` | false | Draw ahead of pen tip using `getPredictedEvents()` |
| `pressureMultiplier` | `number` | 1.0 | Scales raw hardware pressure before `thinning` is applied |
| `pressureGamma` | `number` | 1.0 | Gamma curve applied to pressure (>1 compresses low pressure, <1 expands it) |
| `palmRejection` | `boolean` | true | Ignore touch contacts wider/taller than `palmThreshold` px |
| `palmThreshold` | `number` | 60 | Contact size threshold (px) for palm rejection |

Settings are persisted to `localStorage` as JSON under key `"drawingSettings"`. The context provides `{ settings, update(patch), reset() }`.

Both drawing components read these via refs (same pattern as `colorRef`/`penWidthRef`) so stale closures in `useCallback` event handlers always see current values. Changing any render-affecting setting (all except `predictive`) also clears `strokePathCache` so completed strokes are redrawn with the new parameters.

### Undo / redo

Document viewers maintain per-page explicit undo and redo stacks (`undoByPage`/`redoByPage`) keyed by page number, both typed as `Record<number, DocUndoEntry[]>`:

```typescript
type DocUndoEntry =
  | { kind: "stroke";       stroke: Stroke }
  | { kind: "batch-delete"; strokes: Stroke[] }
  | { kind: "batch-move";   deleted: Stroke[]; created: Stroke[] };
```

`handleInlineStroke` pushes a `stroke` entry after the API save. `handleBatchDeleteInline`/`handleBatchMoveInline` (called from `DocumentOverlay` via `onBatchDelete`/`onBatchMove`) push batch entries. `undoInline` pops from `undoByPage` and dispatches on `entry.kind`; each undo pushes a corresponding inverse entry onto `redoByPage` with fresh server-assigned IDs so subsequent redo uses correct IDs.

Note editors use a **global cross-section stack** in `NoteEditor`: `undoStack` and `redoStack` hold `NoteUndoEntry[]` entries:

```typescript
type NoteUndoEntry =
  | { sectionId: number; stroke: Stroke }
  | { kind: "batch-delete";    sectionId: number; strokes: Stroke[] }
  | { kind: "batch-move";      sectionId: number; deleted: Stroke[]; created: Stroke[] }
  | { kind: "batch-duplicate"; sectionId: number; created: Stroke[] };
```

`NoteEditor` passes `undoPending`/`redoPending` (single-stroke) and `undoBatchPending`/`redoBatchPending` (batch) props down to the matching `SectionCanvas`, which performs the actual API calls and reports results back via consumed callbacks. Batch operations are reported up via `onBatchOperation`.

### DjVu global

`DjVu.js` is not an ES module. `public/djvu.js` is a pre-built IIFE that sets `window.DjVu`. It is loaded via a plain `<script>` tag in `index.html` before the React bundle. Type declarations are in `src/types/djvu.d.ts`. Do not attempt to `import` it.

### Region enrichment

The backend `Region` type has `section_id` but not `note_id`. The document viewers enrich regions at load time by fetching each section (`sectionsApi.get(r.section_id)`) to obtain its `note_id`, producing the frontend-only `EnrichedRegion` type (`DocumentOverlay.tsx`). This is a parallel `Promise.all` fetch, not a backend join.

When `RegionLinkModal` confirms a link it first calls `sectionsApi.create` to add a new section to the target note, then `regionsApi.create` linking that section to the drawn rectangle. Navigating to the note after linking is intentional — the new section needs to be visible immediately.

### Region context menu

Clicking a region navigates to its linked note. Long-pressing on touch or right-clicking opens a fixed-position context menu with **Open Note** and **Resize Region** options. Resize handles only appear after the user explicitly enters edit mode via this menu — there are no hover-activated handles. `suppressRegionClickRef` prevents a click event from firing after a long-press that opened the menu.

Resize uses 8 handles (`nw`, `ne`, `sw`, `se` corners + `n`, `s`, `e`, `w` edge midpoints), defined in `REGION_HANDLE_DESCRIPTORS`. Corners are rendered as solid squares; edge handles as thin bars on the corresponding side. Dragging a handle calls `resizeRegionRect` with the handle key, computing the new rect while keeping the opposite edge/corner anchored.

### Document viewer architecture

`DocumentViewer/` is split into four layers:

| File | Role |
|------|------|
| `viewerTypes.ts` | Shared interfaces (`ViewerProps`, `NaturalSize`, `PendingRegion`, `ViewportSize`, `PanState`), constants (`ZOOM_STEPS`, `WINDOW_BUFFER`, `PAGE_GUTTER`, `PAN_DEADZONE_PX`, `PAGE_FALLBACK_WIDTH/HEIGHT`), and pure helpers (`toStrokeData`, `getDisplayScale`) |
| `useDocumentViewer.ts` | Custom hook `useDocumentViewer` — owns all shared state, refs, and handlers (zoom, pan, undo/redo, strokes, regions, page navigation, scroll sync). Exposes `setNumPages`, `setNaturalSizes`, `setPageLabels`, `setLoading`, `setError` so format-specific loading effects can feed data in. Also owns cross-device page sync (see below). |
| `ViewerShell.tsx` | Shared UI: toolbar, page list, `DocumentOverlay` per page. Accepts the full `UseDocumentViewerResult` spread as props plus a render-page callback. |
| `PdfViewer.tsx` / `DjvuViewer.tsx` | Thin wrappers. Each calls `useDocumentViewer`, adds format-specific loading/rendering effects (pdf.js or DjVu.js), and renders `<ViewerShell>` with a format-specific `renderPage` callback. |

The key design constraint: PDF preloads natural sizes asynchronously before setting `numPages`, while DjVu sets both synchronously. The hook therefore accepts `numPages`/`naturalSizes` as settable state rather than computing them itself.

### Cross-device page sync

`useDocumentViewer` persists the current page to `Document.last_page` on the server and exposes a sync button when another device has advanced further.

- **Write**: on every `pageNum` change (once the document is loaded), `localStorage` is updated immediately and a debounced PATCH fires after 1.5 s. The response updates `remotePage` / `remotePageUpdatedAt` in local state.
- **Poll**: a `visibilitychange` listener + 60 s interval re-fetches the document and updates `remotePage`. This is how changes from another device are detected.
- **`syncAvailable`**: `true` when `remotePage !== null && remotePage !== pageNum && !hasPendingWrite`. The `hasPendingWrite` flag is set via `useLayoutEffect` (fires before paint, preventing flicker) and cleared when the debounce timer fires.
- **`ViewerShell`** renders a sync button next to the page input that is visually inactive (low opacity) when `!syncAvailable`. Clicking it shows a `window.confirm` with the target page and a time-ago hint, then calls `handleSync` which scrolls to `remotePage`.
- **Timezone gotcha**: SQLite drops timezone info from stored datetimes. `last_page_updated_at` arrives as a naive ISO string; the frontend appends `Z` before passing it to `new Date()` to ensure UTC interpretation.

### Tool modes

`ToolMode = "auto" | "hand" | "pen" | "highlighter" | "stroke-eraser" | "segment-eraser" | "stroke-select" | "select-region" | "text-select"` (defined in `src/types/index.ts`).

The unified `Toolbar` component (`src/components/Toolbar/`) renders tool buttons, colour swatches, and stroke-width buttons. `availableTools: ToolMode[]` controls which tools appear — notes include all tools except `select-region` and `text-select`; document viewers include all nine. `UndoRedoBar` (`src/components/UndoRedoBar/`) is a separate component rendered alongside `Toolbar` in both contexts.

Below 912px the toolbar switches to a compact layout: `hand`, `pen`, `highlighter`, and `segment-eraser` collapse into a `⋯` overflow popup; colour swatches move into a popup triggered by the active colour swatch button; stroke-width buttons move into a popup triggered by the active width dot button. Above 912px everything renders inline as before. The breakpoint is detected via `window.matchMedia` inside the component.

In `"hand"` mode the SVG overlay has `pointerEvents: none`; region `<div>`s become clickable. In all explicit tool modes (`"pen"`, `"highlighter"`, `"stroke-eraser"`, `"segment-eraser"`, `"stroke-select"`, `"select-region"`, `"text-select"`), the SVG captures pointer events from **all** input types — pen, finger/touch, and mouse — and region divs get `pointerEvents: none`. In `"highlighter"` mode strokes are drawn at 3× the selected pen width with `thinning: 0` (flat, pressure-independent width); the color is saved as an 8-digit hex (`#rrggbbaa`) with alpha `80` (50% opacity). This encoding means no backend schema change is needed — the color column already stores text. `flipLightness` in `utils.ts` strips and re-appends the alpha when inverting for dark mode. `DrawingCanvas` detects highlighter strokes by checking `s.color.length === 9` and renders them with `thinning: 0`. In `"select-region"` mode dragging produces a pending selection rectangle; a contextual menu then lets the user create a linked note. In `"stroke-select"` mode dragging produces a selection rectangle that hit-tests strokes (any stroke with a point inside is selected); selected strokes stay full-opacity, others dim to 0.3. The `StrokeSelectionOverlay` component renders the 8-handle resize rect, a × delete button (red circle, 8 px right and 22 px above the NE corner), and a ⧉ duplicate button (blue circle, same x, 22 px below the top edge); dragging inside the rect moves the selection. Duplicate shifts copies 20 px down-right and keeps them selected for immediate repositioning. Resizing re-runs hit-test. Undo/redo supported for delete, move, and duplicate. In `"text-select"` mode a transparent text layer div is rendered between the canvas and the SVG overlay: for PDFs it is populated via `pdfjsLib.TextLayer` at scale=1 (then CSS `scale()` on the container handles zoom); for DjVu it uses percentage-positioned `<span>` elements from `djvuPage.getNormalizedTextZones()`. The SVG and region divs having `pointerEvents: none` lets the browser's native selection reach the text layer.

`"auto"` mode routes input by pointer type at the SVG level: the SVG handler returns early for any non-pen input, leaving finger/mouse events to fall through to region divs (which have `pointerEvents: auto` in auto mode). When a stylus hits a region div, `handleRegionPointerDown` transfers pointer capture to the SVG and starts a stroke directly — this avoids the race condition of updating React state before `pointermove` fires.

Hardware barrel-button overrides (`getPenHwOverride`) fire `onHwOverrideChange` callbacks up to `Toolbar` so the overriding tool is highlighted in amber (`activeOverride` prop) without changing the selected `ToolMode`.

### Touch mode

`TouchModeProvider` (`src/context/TouchMode.tsx`) wraps the entire app and exposes `{ isTouch, toggle }` via `useTouchMode()`. The value is persisted to `localStorage` and the `has-touch` class is toggled on `<html>` so CSS can target it. The sidebar toggle button calls `toggle()`; CSS rules keyed on `.has-touch` adjust tap-target sizes, show/hide controls, and switch the sidebar to overlay mode.

### Dark mode

`ThemeProvider` (`src/context/Theme.tsx`) exposes `{ theme, resolvedTheme, setTheme }` via `useTheme()`. `theme` is the user choice (`"light" | "dark" | "system"`); `resolvedTheme` is the effective value after resolving `"system"` against `window.matchMedia("(prefers-color-scheme: dark)")`. The choice is persisted to `localStorage` under key `"theme"` and defaults to `"system"`.

On resolve, `data-theme="light|dark"` is set on `<html>` (CSS vars key off this) and the `<meta name="theme-color">` tag is updated.

Ink strokes store colors in their original form. In dark mode, `flipLightness(hex)` (`src/components/Canvas/utils.ts`) inverts the HSL lightness (`L → 1 - L`) before rendering, so dark strokes become light and vice versa. The stored data is never mutated.

### NoteStrokePreview

`NoteStrokePreview` (`src/components/DocumentViewer/NoteStrokePreview.tsx`) renders a floating or inline preview of a note's handwritten content. It fetches all sections and their strokes, renders each section as a cropped SVG (bounding-box viewport around the strokes), and falls back to `RegionPreview` for sections with no strokes. Used in `DocumentOverlay` to show a tooltip preview of the linked note when hovering over a region box. The preview is pointer-events-none and viewport-clamped in floating mode.

### MergeModal

`MergeModal` (`src/components/MergeModal.tsx`) lets the user merge all sections of the current note into another note. It is opened from the note title bar. On confirm it calls the merge API, navigates to the target note, and fires `sidebar:refresh` so the sidebar removes the now-deleted source note.

### UploadDocumentModal

`UploadDocumentModal` (`src/components/UploadDocumentModal.tsx`) is the entry point for adding a document. It presents a URL input field and a "Browse file…" button. Entering a URL and confirming calls `POST /documents/from-url`; Browse opens the OS file picker and calls `POST /documents/` (multipart). In both paths the user is prompted for a name (via `window.prompt`) before the upload fires. The modal is used in both `Sidebar` and `FolderPage`, accepting `folderId?`, `onClose`, and `onUploaded` props.

### Cross-component events

Two `window` custom events keep the sidebar and document viewers in sync without a shared store:

| Event | `detail` | Fired by | Listened by |
|-------|----------|----------|-------------|
| `sidebar:refresh` | — | PdfViewer/DjvuViewer (region created), MergeModal (note merged) | Sidebar — full reload |
| `document:page-strokes-changed` | `{ documentId, pageNumber }` | PdfViewer/DjvuViewer (first/last stroke on page), Sidebar (page strokes deleted) | Sidebar — re-fetches `annotatedPages` for that doc; PdfViewer/DjvuViewer — reloads strokes if currently on that page |
| `document:toc-loaded` | `{ documentId, toc: TocEntry[] }` | PdfViewer (via `doc.getOutline()`), DjvuViewer (via `doc.getContents()`) | Sidebar — stores TOC for that doc, auto-expands document row and Contents section |

Fire `sidebar:refresh` for mutations that change the note/document/folder tree. Fire `document:page-strokes-changed` for mutations that change whether a document page has inline strokes. The `document:page-strokes-changed` event is only dispatched when a page crosses the zero-stroke boundary (empty → first stroke, or last stroke → empty).

### TypeScript config notes

`strict`, `noUnusedLocals`, and `noUnusedParameters` are all enabled. Prefix intentionally unused variables with `_` to satisfy the compiler.

The `@/` path alias maps to `src/`.
