import { useRef } from "react";
import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from "react";

export type DragKind = "folder" | "document";
export interface DragItem { type: DragKind; id: number; scope: number | null }

interface DragOver { id: number; pos: "before" | "after" }

interface Opts {
  dragItemRef: MutableRefObject<DragItem | null>;
  setDraggingId: Dispatch<SetStateAction<{ type: DragKind; id: number } | null>>;
  setDragOverId: Dispatch<SetStateAction<DragOver | null>>;
  commitReorder: (item: DragItem, targetId: number, pos: "before" | "after") => void;
  suppressClickRef: MutableRefObject<boolean>;
}

interface GestureState {
  item: DragItem;
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
  timer: number | null;
  lastX: number;
  lastY: number;
}

// Hold this long with the finger still to pick a row up for reordering.
const LONG_PRESS_MS = 350;
// Moving more than this before the long-press fires is treated as a scroll, not a drag.
const MOVE_CANCEL_PX = 10;

/**
 * Touch-friendly reordering for sidebar rows. The browser's native HTML5
 * drag-and-drop (`draggable`) never fires for touch input, so this hook drives
 * the same `draggingId`/`dragOverId` state via pointer events instead:
 * long-press to pick a row up, drag over a sibling to choose a drop position,
 * release to commit. Mouse keeps using native DnD; pen and touch (neither of
 * which fires native DnD on a touchscreen) go through this hook.
 *
 * Returns a handler to wire to each draggable row's `onPointerDown`. Rows must
 * carry `data-drag-type` and `data-drag-id` so the drop target can be found via
 * `elementFromPoint` while dragging.
 */
export function useTouchReorder(opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stateRef = useRef<GestureState | null>(null);
  // Stable handler identities so add/removeEventListener pair up across renders.
  const api = useRef<{ start: (e: ReactPointerEvent, item: DragItem) => void } | null>(null);

  if (!api.current) {
    const preventScroll = (e: TouchEvent) => {
      if (stateRef.current?.started) e.preventDefault();
    };

    const cleanup = () => {
      const st = stateRef.current;
      if (st?.timer != null) clearTimeout(st.timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", preventScroll);
      stateRef.current = null;
      optsRef.current.dragItemRef.current = null;
      optsRef.current.setDraggingId(null);
      optsRef.current.setDragOverId(null);
    };

    const targetUnder = (x: number, y: number, type: DragKind) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const row = el?.closest<HTMLElement>("[data-drag-id]");
      if (!row || row.dataset.dragType !== type) return null;
      return { id: Number(row.dataset.dragId), rect: row.getBoundingClientRect() };
    };

    // Commit the reorder against whatever row sits under (x, y), if any.
    const finish = (st: GestureState, x: number, y: number) => {
      // Suppress the click the browser synthesizes after the touch sequence.
      optsRef.current.suppressClickRef.current = true;
      const t = targetUnder(x, y, st.item.type);
      if (t && t.id !== st.item.id) {
        const pos = y < t.rect.top + t.rect.height / 2 ? "before" : "after";
        optsRef.current.commitReorder(st.item, t.id, pos);
      }
    };

    const onMove = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (!st.started) {
        // A scroll (or tap-and-drag) before the long-press fired — let it be.
        if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) > MOVE_CANCEL_PX) cleanup();
        return;
      }
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      const t = targetUnder(e.clientX, e.clientY, st.item.type);
      if (!t) {
        optsRef.current.setDragOverId(null);
        return;
      }
      const pos = e.clientY < t.rect.top + t.rect.height / 2 ? "before" : "after";
      optsRef.current.setDragOverId((prev) =>
        prev?.id === t.id && prev.pos === pos ? prev : { id: t.id, pos });
    };

    const onUp = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (st.started) finish(st, e.clientX, e.clientY);
      cleanup();
    };

    // A `pointercancel` after we've picked a row up (e.g. a late native
    // long-press the browser still managed to fire) shouldn't silently drop the
    // drag — commit at the last position we tracked instead of discarding it.
    const onCancel = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (st.started) finish(st, st.lastX, st.lastY);
      cleanup();
    };

    const start = (e: ReactPointerEvent, item: DragItem) => {
      if (e.pointerType === "mouse") return;        // mouse uses native HTML5 DnD
      if (stateRef.current) return;                 // ignore extra contacts mid-gesture
      if ((e.target as HTMLElement).closest("button")) return; // row action buttons

      stateRef.current = {
        item,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        timer: null,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);

      stateRef.current.timer = window.setTimeout(() => {
        const st = stateRef.current;
        if (!st) return;
        st.started = true;
        st.timer = null;
        optsRef.current.dragItemRef.current = st.item;
        optsRef.current.setDraggingId({ type: st.item.type, id: st.item.id });
        // Non-passive so we can stop the list from scrolling under the dragged row.
        document.addEventListener("touchmove", preventScroll, { passive: false });
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    };

    api.current = { start };
  }

  return api.current.start;
}
