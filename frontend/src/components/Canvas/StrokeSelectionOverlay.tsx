import { useState, useEffect, useRef } from "react";
import {
  type NaturalRect,
  type SelectionResizeHandle,
  SELECTION_HANDLE_DESCRIPTORS,
  getSelectionHandleVisualStyle,
  resizeRectByHandle,
} from "./strokeSelectUtils";

const HANDLE_SIZE_PX = 28;

interface Props {
  rect: NaturalRect;
  naturalWidth: number;
  naturalHeight: number;
  containerRef: React.RefObject<HTMLElement>;
  onRectChange: (newRect: NaturalRect) => void;
  onMoveChange?: (dx: number, dy: number) => void;
  onMoveComplete: (dx: number, dy: number) => void;
  onDelete: () => void;
}

export default function StrokeSelectionOverlay({
  rect,
  naturalWidth,
  naturalHeight,
  containerRef,
  onRectChange,
  onMoveChange,
  onMoveComplete,
  onDelete,
}: Props) {
  const [localRect, setLocalRect] = useState<NaturalRect>(rect);
  const activeGestureRef = useRef<"resize" | "move" | null>(null);

  useEffect(() => {
    if (!activeGestureRef.current) {
      setLocalRect(rect);
    }
  }, [rect]);

  function toNaturalDelta(clientDx: number, clientDy: number): { dx: number; dy: number } {
    const container = containerRef.current;
    if (!container) return { dx: 0, dy: 0 };
    const cRect = container.getBoundingClientRect();
    if (cRect.width === 0 || cRect.height === 0) return { dx: 0, dy: 0 };
    return {
      dx: clientDx * (naturalWidth / cRect.width),
      dy: clientDy * (naturalHeight / cRect.height),
    };
  }

  function startResizeDrag(handle: SelectionResizeHandle, startClientX: number, startClientY: number, startRect: NaturalRect) {
    activeGestureRef.current = "resize";

    function onMove(ev: PointerEvent) {
      const { dx, dy } = toNaturalDelta(ev.clientX - startClientX, ev.clientY - startClientY);
      setLocalRect(resizeRectByHandle(startRect, handle, dx, dy, naturalWidth, naturalHeight));
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeGestureRef.current = null;
      const { dx, dy } = toNaturalDelta(ev.clientX - startClientX, ev.clientY - startClientY);
      const newRect = resizeRectByHandle(startRect, handle, dx, dy, naturalWidth, naturalHeight);
      setLocalRect(newRect);
      onRectChange(newRect);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startMoveDrag(startClientX: number, startClientY: number, startRect: NaturalRect) {
    activeGestureRef.current = "move";

    function onMove(ev: PointerEvent) {
      const { dx, dy } = toNaturalDelta(ev.clientX - startClientX, ev.clientY - startClientY);
      const clampedDx = Math.max(-startRect.x, Math.min(naturalWidth  - startRect.x - startRect.width,  dx));
      const clampedDy = Math.max(-startRect.y, Math.min(naturalHeight - startRect.y - startRect.height, dy));
      setLocalRect({ ...startRect, x: startRect.x + clampedDx, y: startRect.y + clampedDy });
      onMoveChange?.(clampedDx, clampedDy);
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      activeGestureRef.current = null;
      const { dx, dy } = toNaturalDelta(ev.clientX - startClientX, ev.clientY - startClientY);
      const clampedDx = Math.max(-startRect.x, Math.min(naturalWidth  - startRect.x - startRect.width,  dx));
      const clampedDy = Math.max(-startRect.y, Math.min(naturalHeight - startRect.y - startRect.height, dy));
      onMoveComplete(clampedDx, clampedDy);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const leftPct   = (localRect.x / naturalWidth)  * 100;
  const topPct    = (localRect.y / naturalHeight)  * 100;
  const widthPct  = (localRect.width / naturalWidth)  * 100;
  const heightPct = (localRect.height / naturalHeight) * 100;

  return (
    <>
      {/* Selection rect with resize handles */}
      <div
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          background: "rgba(74,108,247,0.06)",
          border: "1.5px dashed rgba(74,108,247,0.7)",
          borderRadius: 2,
          boxSizing: "border-box",
          touchAction: "none",
          cursor: "move",
          zIndex: 10,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startMoveDrag(e.clientX, e.clientY, localRect);
        }}
      >
        {SELECTION_HANDLE_DESCRIPTORS.map((h) => (
          <div
            key={h.key}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startResizeDrag(h.key, e.clientX, e.clientY, localRect);
            }}
            style={{
              position: "absolute",
              left: h.left,
              top: h.top,
              width: HANDLE_SIZE_PX,
              height: HANDLE_SIZE_PX,
              transform: "translate(-50%, -50%)",
              cursor: h.cursor,
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            <div style={{ ...getSelectionHandleVisualStyle(h), pointerEvents: "none" }} />
          </div>
        ))}
      </div>

      {/* Delete × button — outside the top-right corner */}
      <div
        style={{
          position: "absolute",
          left: `calc(${leftPct + widthPct}% + 8px)`,
          top: `calc(${topPct}% - 22px)`,
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          touchAction: "none",
          zIndex: 11,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#c0392b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 18,
            lineHeight: 1,
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
            userSelect: "none",
          }}
        >
          ×
        </div>
      </div>
    </>
  );
}
