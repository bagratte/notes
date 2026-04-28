import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import type { StrokeData } from "./types";
import { svgPathFromStroke } from "./utils";
import { useDrawingSettings } from "@/context/DrawingSettings";

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

function normalizePressure(pressure: number, pointerType: string): number {
  if (pointerType === "pen") {
    if (pressure > 0) return Math.min(1, Math.max(0.12, pressure));
    return 0.2;
  }
  return pressure > 0 ? pressure : 0.5;
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
  const [activePointerType, setActivePointerType] = useState<string | null>(null);
  const { settings: ds } = useDrawingSettings();

  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // Live stroke is drawn to this canvas — bypasses SVG DOM and paints directly
  // to a GPU-backed buffer, eliminating the path-parse overhead on every move.
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());
  const strokePathCache = useRef<Map<number | StrokeData, { points: StrokeData["points"]; d: string }>>(new Map());
  const canvasScaleRef = useRef(1);

  const colorRef = useRef(color);
  const penWidthRef = useRef(penWidth);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const streamlineRef = useRef(ds.streamline);
  const predictiveRef = useRef(ds.predictive);
  const thinningRef = useRef(ds.thinning);
  const smoothingRef = useRef(ds.smoothing);
  const simulatePressureRef = useRef(ds.simulatePressure);
  const palmRejectionRef = useRef(ds.palmRejection);
  const palmThresholdRef = useRef(ds.palmThreshold);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
  useEffect(() => { streamlineRef.current = ds.streamline; }, [ds.streamline]);
  useEffect(() => { predictiveRef.current = ds.predictive; }, [ds.predictive]);
  useEffect(() => { thinningRef.current = ds.thinning; }, [ds.thinning]);
  useEffect(() => { smoothingRef.current = ds.smoothing; }, [ds.smoothing]);
  useEffect(() => { simulatePressureRef.current = ds.simulatePressure; }, [ds.simulatePressure]);
  useEffect(() => { palmRejectionRef.current = ds.palmRejection; }, [ds.palmRejection]);
  useEffect(() => { palmThresholdRef.current = ds.palmThreshold; }, [ds.palmThreshold]);
  useEffect(() => { strokePathCache.current.clear(); }, [ds.streamline, ds.thinning, ds.smoothing, ds.simulatePressure]);

  // Match canvas resolution to the SVG coordinate space so strokes align pixel-perfectly.
  useEffect(() => {
    const canvas = liveCanvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;

    if (viewBox) {
      const parts = viewBox.split(" ").map(Number);
      canvas.width = parts[2];
      canvas.height = parts[3];
      return;
    }

    // No viewBox: stroke coords are CSS pixels. Scale buffer by DPR for HiDPI sharpness.
    const ro = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio || 1;
      canvasScaleRef.current = dpr;
      canvas.width = entry.contentRect.width * dpr;
      canvas.height = entry.contentRect.height * dpr;
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [viewBox]);

  const getSvgTransform = useCallback(() => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb && vb.width > 0 ? vb.width / rect.width : 1;
    const scaleY = vb && vb.height > 0 ? vb.height / rect.height : 1;
    return (clientX: number, clientY: number, pressure: number): [number, number, number] =>
      [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, pressure];
  }, []);

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
    ctx.save();
    const scale = canvasScaleRef.current;
    if (scale !== 1) ctx.scale(scale, scale);
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
    ctx.restore();
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
      if (palmRejectionRef.current && e.pointerType === "touch" &&
          (e.width > palmThresholdRef.current || e.height > palmThresholdRef.current)) return;
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
        updateLivePath(livePointsRef.current);
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
    const canvas = liveCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
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
    <div
      className={className}
      style={{ position: "relative", width, height, display: "block", ...style }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{
          touchAction: inputEnabled ? "none" : "auto",
          pointerEvents: inputEnabled ? "all" : "none",
          cursor: !inputEnabled ? "grab" : eraserMode ? "cell" : activePointerType === "pen" ? "none" : "default",
          display: "block",
        }}
        onPointerEnter={(e) => setActivePointerType(e.pointerType)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {strokes.map((s, i) => {
          const cacheKey: number | StrokeData = s.id ?? s;
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
          return <path key={s.id ?? i} d={d} fill={s.color} data-stroke-id={s.id} />;
        })}
      </svg>
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
