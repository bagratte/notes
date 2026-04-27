import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import type { StrokeData } from "@/components/Canvas";
import type { Region } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";

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

const MIN_REGION_PX = 10;

function normalizePressure(pressure: number, pointerType: string): number {
  if (pointerType === "pen") {
    if (pressure > 0) return Math.min(1, Math.max(0.12, pressure));
    return 0.2;
  }
  return pressure > 0 ? pressure : 0.5;
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
  const { settings: ds } = useDrawingSettings();
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());
  const strokePathCache = useRef<Map<number | string, { points: StrokeData["points"]; d: string }>>(new Map());

  const colorRef = useRef(color);
  const penWidthRef = useRef(penWidth);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const streamlineRef = useRef(ds.streamline);
  const predictiveRef = useRef(ds.predictive);
  const thinningRef = useRef(ds.thinning);
  const smoothingRef = useRef(ds.smoothing);
  const simulatePressureRef = useRef(ds.simulatePressure);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
  useEffect(() => { streamlineRef.current = ds.streamline; }, [ds.streamline]);
  useEffect(() => { predictiveRef.current = ds.predictive; }, [ds.predictive]);
  useEffect(() => { thinningRef.current = ds.thinning; }, [ds.thinning]);
  useEffect(() => { smoothingRef.current = ds.smoothing; }, [ds.smoothing]);
  useEffect(() => { simulatePressureRef.current = ds.simulatePressure; }, [ds.simulatePressure]);
  useEffect(() => { strokePathCache.current.clear(); }, [ds.streamline, ds.thinning, ds.smoothing, ds.simulatePressure]);

  useEffect(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas || !viewBox) return;
    const parts = viewBox.split(" ").map(Number);
    canvas.width = parts[2];
    canvas.height = parts[3];
  }, [viewBox]);

  // Returns a converter that captures SVG geometry once per event batch,
  // avoiding repeated getBoundingClientRect calls across coalesced events.
  const getSvgTransform = useCallback(
    () => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width > 0 ? vb.width / rect.width : 1;
      const scaleY = vb.height > 0 ? vb.height / rect.height : 1;
      return (clientX: number, clientY: number, pressure: number): [number, number, number] =>
        [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, pressure];
    },
    []
  );

  const updateLivePath = useCallback((pts: [number, number, number][]) => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pts.length === 0) return;
    const outline = getStroke(pts, {
      thinning: thinningRef.current,
      smoothing: smoothingRef.current,
      streamline: streamlineRef.current,
      simulatePressure: simulatePressureRef.current,
      size: penWidthRef.current,
    });
    if (outline.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = colorRef.current;
    ctx.fill();
  }, []);

  const eraseAtPoint = useCallback(
    (e: React.PointerEvent, firstOnly: boolean) => {
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
      const toSvgCoords = getSvgTransform();
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
      drawing.current = true;
      if (mode === "annotate") {
        livePointsRef.current = [pt];
        updateLivePath(livePointsRef.current);
      } else if (mode === "stroke-eraser") {
        erasedIds.current.clear();
        eraseAtPoint(e, false);
      } else {
        setDragStart([pt[0], pt[1]]);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, getSvgTransform, eraseAtPoint, updateLivePath]
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
        const toSvgCoords = getSvgTransform();
        const pts = livePointsRef.current;
        for (const ce of coalescedEvents) {
          pts.push(toSvgCoords(ce.clientX, ce.clientY, normalizePressure(ce.pressure, ce.pointerType)));
        }
        const predictedEvents = predictiveRef.current
          ? (e.nativeEvent as PointerEvent).getPredictedEvents?.() ?? []
          : [];
        const drawPts: [number, number, number][] = predictedEvents.length > 0
          ? [...pts, ...predictedEvents.map((pe) => toSvgCoords(pe.clientX, pe.clientY, normalizePressure(pe.pressure, pe.pointerType)))]
          : pts;
        updateLivePath(drawPts);
      } else if (mode === "stroke-eraser") {
        eraseAtPoint(e, false);
      } else if (mode === "region") {
        const pt = getSvgTransform()(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, getSvgTransform, eraseAtPoint, updateLivePath]
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
      const canvas = liveCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
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

      {/* Drawing SVG — completed strokes + region drag rectangle */}
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
        {strokes.map((s, i) => {
          const cacheKey = s.id ?? i;
          const cached = strokePathCache.current.get(cacheKey);
          let d: string;
          if (cached && cached.points === s.points) {
            d = cached.d;
          } else {
            const outline = getStroke(s.points, {
              thinning: thinningRef.current,
              smoothing: smoothingRef.current,
              streamline: streamlineRef.current,
              simulatePressure: simulatePressureRef.current,
              size: s.width,
            });
            d = svgPathFromStroke(outline);
            strokePathCache.current.set(cacheKey, { points: s.points, d });
          }
          return <path key={cacheKey} d={d} fill={s.color} data-stroke-id={s.id} />;
        })}

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

      {/* Live canvas — draws the in-progress stroke without touching the SVG DOM */}
      <canvas
        ref={liveCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
