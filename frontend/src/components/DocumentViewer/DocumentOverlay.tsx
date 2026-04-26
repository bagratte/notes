import { useState, useRef, useCallback, useEffect } from "react";
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

function normalizePressure(pressure: number, pointerType: string): number {
  if (pointerType === "pen") {
    if (pressure > 0) return Math.min(1, Math.max(0.12, pressure));
    return 0.2;
  }
  return pressure > 0 ? pressure : 0.5;
}

function smoothPoint(
  last: [number, number, number],
  next: [number, number, number],
  pointerType: string
): [number, number, number] {
  if (pointerType !== "pen") return next;
  return [
    last[0] + (next[0] - last[0]) * 0.45,
    last[1] + (next[1] - last[1]) * 0.45,
    last[2] + (next[2] - last[2]) * 0.6,
  ];
}



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
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const [activePointerType, setActivePointerType] = useState<string | null>(null);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());

  const colorRef = useRef(color);
  const penWidthRef = useRef(penWidth);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);

  const toSvgCoords = useCallback(
    (clientX: number, clientY: number, pressure: number): [number, number, number] => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width > 0 ? vb.width / rect.width : 1;
      const scaleY = vb.height > 0 ? vb.height / rect.height : 1;
      return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, pressure];
    },
    []
  );

  const updateLivePath = useCallback(() => {
    const path = livePathRef.current;
    if (!path) return;
    const pts = livePointsRef.current;
    if (pts.length === 0) {
      path.setAttribute("d", "");
      return;
    }
    const outline = getStroke(pts, { ...STROKE_OPTIONS, size: penWidthRef.current });
    path.setAttribute("d", svgPathFromStroke(outline));
  }, []);

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
      setActivePointerType(e.pointerType);
      if (mode === "view") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
      drawing.current = true;
      if (mode === "annotate") {
        livePointsRef.current = [pt];
        if (livePathRef.current) {
          livePathRef.current.setAttribute("fill", colorRef.current);
        }
        updateLivePath();
      } else if (mode === "stroke-eraser") {
        erasedIds.current.clear();
        eraseAtPoint(e, false);
      } else {
        setDragStart([pt[0], pt[1]]);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgCoords, eraseAtPoint, updateLivePath]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerType !== e.pointerType) {
        setActivePointerType(e.pointerType);
      }
      if (!drawing.current) return;
      e.preventDefault();
      if (mode === "annotate") {
        const coalescedEvents =
          (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent as PointerEvent];
        const pts = livePointsRef.current;
        for (const ce of coalescedEvents) {
          const pressure = normalizePressure(ce.pressure, ce.pointerType);
          const raw = toSvgCoords(ce.clientX, ce.clientY, pressure);
          if (pts.length > 0) {
            pts.push(smoothPoint(pts[pts.length - 1], raw, ce.pointerType));
          } else {
            pts.push(raw);
          }
        }
        updateLivePath();
      } else if (mode === "stroke-eraser") {
        eraseAtPoint(e, false);
      } else if (mode === "region") {
        const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgCoords, eraseAtPoint, updateLivePath]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
    if (!drawing.current) return;
    drawing.current = false;

    if (mode === "annotate") {
      const pts = livePointsRef.current;
      if (pts.length > 0) {
        onStrokeCompleteRef.current?.({ points: [...pts], color: colorRef.current, width: penWidthRef.current });
      }
      livePointsRef.current = [];
      if (livePathRef.current) livePathRef.current.setAttribute("d", "");
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
  }, [mode, onRegionComplete, dragStart, dragCurrent]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    handlePointerUp(e);
    setActivePointerType(null);
  }, [handlePointerUp]);

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
          cursor:
            mode === "annotate" ? (activePointerType === "pen" ? "none" : "default") : mode === "region" ? "crosshair" : mode === "stroke-eraser" ? "cell" : "default",
        }}
        onPointerEnter={(e) => setActivePointerType(e.pointerType)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {strokes.map((s, i) => renderStrokePath(s.points, s.color, s.width, i, s.id))}
        <path ref={livePathRef} d="" fill="" />

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
