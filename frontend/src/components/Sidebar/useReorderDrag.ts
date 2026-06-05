import { useRef } from "react";
import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from "react";

export type DragKind = "folder" | "document";
export interface DragItem { type: DragKind; id: number; scope: number | null }

interface DragOver { id: number; pos: "before" | "after" }

interface Opts {
  treeRef: MutableRefObject<HTMLDivElement | null>;
  setDraggingId: Dispatch<SetStateAction<{ type: DragKind; id: number } | null>>;
  setDragOverId: Dispatch<SetStateAction<DragOver | null>>;
  commitReorder: (item: DragItem, targetId: number, pos: "before" | "after") => void;
}

interface GestureState {
  item: DragItem;
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
  lastX: number;
  lastY: number;
}

const DRAG_START_PX = 3;   // movement before a press on the handle becomes a drag
const EDGE_PX = 48;        // distance from a tree edge that triggers auto-scroll
const EDGE_SPEED = 12;     // px per frame while auto-scrolling

/**
 * Reorder-mode drag for sidebar rows, driven from a per-row drag handle.
 *
 * The handle carries `touch-action: none`, so a press that starts on it is never
 * a scroll/long-press/native-drag — the drag begins on the first movement, with
 * no long-press, identically for touch and pen. (The mouse is skipped here and
 * keeps using native HTML5 DnD on the row.) Because the handle owns the gesture
 * we use `setPointerCapture` + React pointer handlers — events route to the
 * handle for the whole gesture, so the handlers are plain fresh closures with no
 * `window` listeners or stale-closure plumbing.
 *
 * Targets are found via `elementFromPoint(...).closest('[data-drag-id]')`, so
 * rows must carry `data-drag-type` / `data-drag-id`. Dragging into the top/bottom
 * edge band auto-scrolls the `treeRef` container via a `requestAnimationFrame`
 * loop (which keeps scrolling while the finger is held still).
 *
 * Returns a factory: spread `dragHandlers(item)` onto the row's handle element.
 */
export function useReorderDrag(opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stateRef = useRef<GestureState | null>(null);
  const rafRef = useRef<number | null>(null);
  const dirRef = useRef(0);   // -1 = scroll up, 0 = none, 1 = scroll down

  const targetUnder = (x: number, y: number, type: DragKind) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const row = el?.closest<HTMLElement>("[data-drag-id]");
    if (!row || row.dataset.dragType !== type) return null;
    return { id: Number(row.dataset.dragId), rect: row.getBoundingClientRect() };
  };

  const updateDragOver = (x: number, y: number) => {
    const st = stateRef.current;
    if (!st) return;
    const t = targetUnder(x, y, st.item.type);
    if (!t || t.id === st.item.id) { optsRef.current.setDragOverId(null); return; }
    const pos = y < t.rect.top + t.rect.height / 2 ? "before" : "after";
    optsRef.current.setDragOverId((prev) => prev?.id === t.id && prev.pos === pos ? prev : { id: t.id, pos });
  };

  const stopAutoScroll = () => {
    dirRef.current = 0;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  const tick = () => {
    const st = stateRef.current;
    const tree = optsRef.current.treeRef.current;
    if (!st || !tree || dirRef.current === 0) { rafRef.current = null; return; }
    tree.scrollTop += dirRef.current * EDGE_SPEED;
    updateDragOver(st.lastX, st.lastY);   // content slid under a possibly-still finger
    rafRef.current = requestAnimationFrame(tick);
  };

  const updateAutoScroll = (y: number) => {
    const tree = optsRef.current.treeRef.current;
    if (!tree) return;
    const r = tree.getBoundingClientRect();
    const dir = y < r.top + EDGE_PX ? -1 : y > r.bottom - EDGE_PX ? 1 : 0;
    dirRef.current = dir;
    if (dir !== 0 && rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    else if (dir === 0) stopAutoScroll();
  };

  const reset = () => {
    stopAutoScroll();
    stateRef.current = null;
    optsRef.current.setDraggingId(null);
    optsRef.current.setDragOverId(null);
  };

  const onPointerDown = (e: ReactPointerEvent, item: DragItem) => {
    if (e.pointerType === "mouse") return;   // mouse uses native HTML5 DnD on the row
    if (stateRef.current) return;            // ignore extra contacts mid-gesture
    // Keep events flowing to the handle even as the finger leaves it. Guarded:
    // setPointerCapture can throw if the pointer is already gone.
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    stateRef.current = {
      item, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      started: false, lastX: e.clientX, lastY: e.clientY,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const st = stateRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    if (!st.started) {
      if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) <= DRAG_START_PX) return;
      st.started = true;
      optsRef.current.setDraggingId({ type: st.item.type, id: st.item.id });
    }
    updateDragOver(e.clientX, e.clientY);
    updateAutoScroll(e.clientY);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const st = stateRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    if (st.started) {
      const t = targetUnder(e.clientX, e.clientY, st.item.type);
      if (t && t.id !== st.item.id) {
        const pos = e.clientY < t.rect.top + t.rect.height / 2 ? "before" : "after";
        optsRef.current.commitReorder(st.item, t.id, pos);
      }
    }
    reset();
  };

  const onPointerCancel = (e: ReactPointerEvent) => {
    const st = stateRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    reset();
  };

  return (item: DragItem) => ({
    onPointerDown: (e: ReactPointerEvent) => onPointerDown(e, item),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  });
}
