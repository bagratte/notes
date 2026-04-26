import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import type { StrokeData } from "./types";
import { svgPathFromStroke } from "./utils";

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  eraserMode?: boolean;
  color?: string;
  penWidth?: number;
  readonly?: boolean;
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  inputEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};

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

export default function DrawingCanvas({
  strokes,
  onStrokeComplete,
  onEraseStroke,
  eraserMode = false,
  color = "#000000",
  penWidth = 3,
  readonly = false,
  width = "100%",
  height = 300,
  viewBox,
  inputEnabled = true,
  className,
  style,
}: Props) {
  // activePointerType is only used for the cursor — it's fine as state since
  // it only changes when the pointer type switches (pen ↔ mouse/touch), not
  // on every move event.
  const [activePointerType, setActivePointerType] = useState<string | null>(null);

  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // Live stroke is drawn by mutating this path element directly — no React
  // state update occurs during a stroke, eliminating per-frame re-renders.
  const livePathRef = useRef<SVGPathElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());
  // Cache computed SVG path strings for completed strokes so getStroke() and
  // svgPathFromStroke() are not re-run on every render.
  const strokePathCache = useRef<Map<number | string, { points: StrokeData["points"]; d: string }>>(new Map());

  // Mirror mutable props into refs so imperative callbacks always read the
  // current value without needing to appear in their dependency arrays.
  const colorRef = useRef(color);
  const penWidthRef = useRef(penWidth);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);

  // Returns a converter function that captures the current SVG geometry once,
  // so callers can convert multiple points without triggering repeated layout reads.
  const getSvgTransform = useCallback(() => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb && vb.width > 0 ? vb.width / rect.width : 1;
    const scaleY = vb && vb.height > 0 ? vb.height / rect.height : 1;
    return (clientX: number, clientY: number, pressure: number): [number, number, number] =>
      [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, pressure];
  }, []);

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
    (e: React.PointerEvent) => {
      const samples: [number, number][] = [
        [e.clientX, e.clientY],
        [e.clientX + 8, e.clientY], [e.clientX - 8, e.clientY],
        [e.clientX, e.clientY + 8], [e.clientX, e.clientY - 8],
      ];
      for (const [cx, cy] of samples) {
        for (const el of document.elementsFromPoint(cx, cy)) {
          if (!(el instanceof SVGPathElement)) continue;
          const idStr = el.dataset.strokeId;
          if (!idStr) continue;
          const id = parseInt(idStr);
          if (erasedIds.current.has(id)) continue;
          erasedIds.current.add(id);
          onEraseStroke?.(id);
        }
      }
    },
    [onEraseStroke]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActivePointerType(e.pointerType);
      if (readonly || !inputEnabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      if (eraserMode) {
        erasedIds.current.clear();
        eraseAtPoint(e);
      } else {
        const toSvgCoords = getSvgTransform();
        const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
        livePointsRef.current = [pt];
        if (livePathRef.current) {
          livePathRef.current.setAttribute("fill", colorRef.current);
        }
        updateLivePath();
      }
    },
    [readonly, inputEnabled, eraserMode, getSvgTransform, eraseAtPoint, updateLivePath]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawing.current) return;
      e.preventDefault();
      if (eraserMode) {
        eraseAtPoint(e);
      } else {
        // getCoalescedEvents gives all intermediate positions between frames,
        // producing smoother lines especially on high-frequency stylus input.
        const coalescedEvents =
          (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent as PointerEvent];
        // Read SVG geometry once before the loop to avoid layout thrashing
        // (getBoundingClientRect forces a layout recalculation on each call).
        const toSvgCoords = getSvgTransform();
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
      }
    },
    [eraserMode, eraseAtPoint, getSvgTransform, updateLivePath]
  );

  const finishStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    if (eraserMode) return;
    const pts = livePointsRef.current;
    if (pts.length > 0) {
      onStrokeCompleteRef.current?.({
        points: [...pts],
        color: colorRef.current,
        width: penWidthRef.current,
      });
    }
    livePointsRef.current = [];
    if (livePathRef.current) livePathRef.current.setAttribute("d", "");
  }, [eraserMode]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActivePointerType(e.pointerType);
      finishStroke();
    },
    [finishStroke]
  );

  const handlePointerLeave = useCallback(
    () => {
      setActivePointerType(null);
      finishStroke();
    },
    [finishStroke]
  );

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={viewBox}
      className={className}
      style={{
        touchAction: inputEnabled ? "none" : "auto",
        pointerEvents: inputEnabled ? "all" : "none",
        cursor: !inputEnabled ? "grab" : eraserMode ? "cell" : activePointerType === "pen" ? "none" : "default",
        display: "block",
        ...style,
      }}
      onPointerEnter={(e) => setActivePointerType(e.pointerType)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {strokes.map((s) => {
        const cacheKey = s.id ?? s;
        const cached = strokePathCache.current.get(cacheKey);
        let d: string;
        if (cached && cached.points === s.points) {
          d = cached.d;
        } else {
          const outline = getStroke(s.points, { ...STROKE_OPTIONS, size: s.width });
          d = svgPathFromStroke(outline);
          strokePathCache.current.set(cacheKey, { points: s.points, d });
        }
        return <path key={s.id ?? cacheKey} d={d} fill={s.color} data-stroke-id={s.id} />;
      })}
      {/* Live path is mutated imperatively — React never writes to its `d` attribute */}
      <path ref={livePathRef} d="" fill="" />
    </svg>
  );
}
