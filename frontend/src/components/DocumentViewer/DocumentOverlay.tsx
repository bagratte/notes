import { useState, useRef, useCallback } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import type { StrokeData } from "@/components/Canvas";
import type { Region } from "@/types";

export interface EnrichedRegion extends Region {
  note_id: number;
}

export type ToolMode = "view" | "annotate" | "region" | "stroke-eraser";

interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NaturalSize {
  width: number;
  height: number;
}

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (s: StrokeData) => void;
  regions: EnrichedRegion[];
  onRegionComplete?: (rect: DragRect) => void;
  onRegionClick?: (region: EnrichedRegion) => void;
  onEraseStroke?: (id: number) => void;
  mode: ToolMode;
  viewBox?: string;
  naturalSize?: NaturalSize;
  color?: string;
  penWidth?: number;
  className?: string;
}

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};

const MIN_REGION_PX = 10;

function renderStrokePath(
  points: [number, number, number][],
  color: string,
  width: number,
  key: string | number,
  strokeId?: number
) {
  const outline = getStroke(points, { ...STROKE_OPTIONS, size: width });
  const d = svgPathFromStroke(outline);
  return <path key={key} d={d} fill={color} data-stroke-id={strokeId} />;
}

export default function DocumentOverlay({
  strokes,
  onStrokeComplete,
  regions,
  onRegionComplete,
  onRegionClick,
  onEraseStroke,
  mode,
  viewBox,
  naturalSize,
  color = "#000000",
  penWidth = 3,
  className,
}: Props) {
  const [livePoints, setLivePoints] = useState<[number, number, number][]>([]);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const erasedIds = useRef(new Set<number>());

  const toSvgPoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width > 0 ? vb.width / rect.width : 1;
      const scaleY = vb.height > 0 ? vb.height / rect.height : 1;
      return [
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY,
        e.pressure > 0 ? e.pressure : 0.5,
      ];
    },
    []
  );

  const eraseAtPoint = useCallback(
    (e: React.PointerEvent, firstOnly: boolean) => {
      // Sample center + cardinal offsets (8px) for area eraser brush width
      const samples: [number, number][] = firstOnly
        ? [[e.clientX, e.clientY]]
        : [[e.clientX, e.clientY], [e.clientX + 8, e.clientY], [e.clientX - 8, e.clientY], [e.clientX, e.clientY + 8], [e.clientX, e.clientY - 8]];

      for (const [cx, cy] of samples) {
        for (const el of document.elementsFromPoint(cx, cy)) {
          if (!(el instanceof SVGPathElement)) continue;
          const idStr = el.dataset.strokeId;
          if (idStr === undefined) continue;
          const id = parseInt(idStr);
          if (erasedIds.current.has(id)) continue;
          erasedIds.current.add(id);
          onEraseStroke?.(id);
          if (firstOnly) return;
        }
      }
    },
    [onEraseStroke]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (mode === "view") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = toSvgPoint(e);
      drawing.current = true;
      if (mode === "annotate") {
        setLivePoints([pt]);
      } else if (mode === "stroke-eraser") {
        erasedIds.current.clear();
        eraseAtPoint(e, false);
      } else {
        setDragStart([pt[0], pt[1]]);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgPoint, eraseAtPoint]  // toSvgPoint still needed for annotate/region pt
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      if (mode === "annotate") {
        setLivePoints((prev) => [...prev, toSvgPoint(e)]);
      } else if (mode === "stroke-eraser") {
        eraseAtPoint(e, false);
      } else if (mode === "region") {
        const pt = toSvgPoint(e);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgPoint, eraseAtPoint]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;

    if (mode === "annotate") {
      if (livePoints.length > 0 && onStrokeComplete) {
        onStrokeComplete({ points: livePoints, color, width: penWidth });
      }
      setLivePoints([]);
    } else if (mode === "region") {
      if (dragStart && dragCurrent && onRegionComplete) {
        const x = Math.min(dragStart[0], dragCurrent[0]);
        const y = Math.min(dragStart[1], dragCurrent[1]);
        const w = Math.abs(dragCurrent[0] - dragStart[0]);
        const h = Math.abs(dragCurrent[1] - dragStart[1]);
        if (w > MIN_REGION_PX && h > MIN_REGION_PX) {
          onRegionComplete({ x, y, width: w, height: h });
        }
      }
      setDragStart(null);
      setDragCurrent(null);
    }
  }, [mode, onStrokeComplete, onRegionComplete, color, penWidth, livePoints, dragStart, dragCurrent]);

  const dragRect: DragRect | null =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart[0], dragCurrent[0]),
          y: Math.min(dragStart[1], dragCurrent[1]),
          width: Math.abs(dragCurrent[0] - dragStart[0]),
          height: Math.abs(dragCurrent[1] - dragStart[1]),
        }
      : null;

  const active = mode !== "view";

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {/* Region boxes — clickable divs so they work independently of SVG pointer-events */}
      {naturalSize &&
        regions.map((r) => (
          <div
            key={r.id}
            onClick={mode === "view" ? () => onRegionClick?.(r) : undefined}
            title={mode === "view" ? "Open linked note" : undefined}
            style={{
              position: "absolute",
              left: `${(r.x / naturalSize.width) * 100}%`,
              top: `${(r.y / naturalSize.height) * 100}%`,
              width: `${(r.width / naturalSize.width) * 100}%`,
              height: `${(r.height / naturalSize.height) * 100}%`,
              background: "rgba(74, 108, 247, 0.1)",
              border: "1.5px solid rgba(74, 108, 247, 0.55)",
              borderRadius: 2,
              boxSizing: "border-box",
              cursor: mode === "view" ? "pointer" : "default",
              pointerEvents: mode === "view" ? "auto" : "none",
              transition: "background 0.15s, border 0.15s",
            }}
          />
        ))}

      {/* Drawing SVG — strokes + region drag rectangle */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: active ? "none" : "auto",
          pointerEvents: active ? "all" : "none",
          cursor: mode === "region" ? "crosshair" : mode === "stroke-eraser" ? "cell" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {strokes.map((s, i) => renderStrokePath(s.points, s.color, s.width, i, s.id))}
        {livePoints.length > 0 &&
          renderStrokePath(livePoints, color, penWidth, "live")}

        {dragRect && (
          <rect
            x={dragRect.x}
            y={dragRect.y}
            width={dragRect.width}
            height={dragRect.height}
            fill="rgba(74, 108, 247, 0.08)"
            stroke="rgba(74, 108, 247, 0.7)"
            strokeWidth={1}
            strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}
