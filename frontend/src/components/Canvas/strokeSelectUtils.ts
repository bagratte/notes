import type { StrokeData } from "./types";
import type { Stroke } from "@/types";

export interface NaturalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SelectionResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
export type SelectionHandleKind = "corner" | "edge-h" | "edge-v";

export interface SelectionHandleDescriptor {
  key: SelectionResizeHandle;
  left: string;
  top: string;
  cursor: string;
  kind: SelectionHandleKind;
}

export const SELECTION_HANDLE_DESCRIPTORS: SelectionHandleDescriptor[] = [
  { key: "nw", left: "0%",   top: "0%",   cursor: "nwse-resize", kind: "corner" },
  { key: "ne", left: "100%", top: "0%",   cursor: "nesw-resize", kind: "corner" },
  { key: "sw", left: "0%",   top: "100%", cursor: "nesw-resize", kind: "corner" },
  { key: "se", left: "100%", top: "100%", cursor: "nwse-resize", kind: "corner" },
  { key: "n",  left: "50%",  top: "0%",   cursor: "ns-resize",   kind: "edge-h" },
  { key: "s",  left: "50%",  top: "100%", cursor: "ns-resize",   kind: "edge-h" },
  { key: "w",  left: "0%",   top: "50%",  cursor: "ew-resize",   kind: "edge-v" },
  { key: "e",  left: "100%", top: "50%",  cursor: "ew-resize",   kind: "edge-v" },
];

export function getSelectionHandleVisualStyle(h: SelectionHandleDescriptor): React.CSSProperties {
  if (h.kind === "corner") {
    return {
      width: 12,
      height: 12,
      background: "transparent",
      borderTop:    h.key.includes("n") ? "2.5px solid rgba(74,108,247,0.95)" : undefined,
      borderBottom: h.key.includes("s") ? "2.5px solid rgba(74,108,247,0.95)" : undefined,
      borderLeft:   h.key.includes("w") ? "2.5px solid rgba(74,108,247,0.95)" : undefined,
      borderRight:  h.key.includes("e") ? "2.5px solid rgba(74,108,247,0.95)" : undefined,
      filter: "drop-shadow(0 0 1.5px white) drop-shadow(0 0 2px rgba(0,0,0,0.25))",
      boxSizing: "border-box",
    };
  }
  const isEdgeH = h.kind === "edge-h";
  return {
    width: isEdgeH ? 22 : 5,
    height: isEdgeH ? 5 : 22,
    background: "white",
    border: "1.5px solid rgba(74,108,247,0.9)",
    borderRadius: 3,
    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
    boxSizing: "border-box",
  };
}

const MIN_SEL_PX = 4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normaliseRect(x1: number, y1: number, x2: number, y2: number): NaturalRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function resizeRectByHandle(
  rect: NaturalRect,
  handle: SelectionResizeHandle,
  dx: number,
  dy: number,
  naturalWidth: number,
  naturalHeight: number,
): NaturalRect {
  let left   = rect.x;
  let top    = rect.y;
  let right  = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes("w")) left   = clamp(rect.x + dx,              0,               right  - MIN_SEL_PX);
  if (handle.includes("e")) right  = clamp(rect.x + rect.width + dx, left + MIN_SEL_PX, naturalWidth);
  if (handle.includes("n")) top    = clamp(rect.y + dy,              0,               bottom - MIN_SEL_PX);
  if (handle.includes("s")) bottom = clamp(rect.y + rect.height + dy, top + MIN_SEL_PX,  naturalHeight);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function hitTestStrokes(strokes: StrokeData[], rect: NaturalRect): Set<number> {
  const selected = new Set<number>();
  for (const s of strokes) {
    if (s.id == null) continue;
    if (s.points.some(([x, y]) =>
      x >= rect.x && x <= rect.x + rect.width &&
      y >= rect.y && y <= rect.y + rect.height,
    )) {
      selected.add(s.id);
    }
  }
  return selected;
}

export function offsetStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map(([x, y, p]) => [x + dx, y + dy, p] as [number, number, number]),
  };
}
