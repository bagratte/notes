import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import type { StrokeData } from "./types";
import { svgPathFromStroke } from "./utils";
import { eraseFromStroke } from "./eraserUtils";
import { useDrawingSettings } from "@/context/DrawingSettings";

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  onSegmentErase?: (deleted: number[], created: StrokeData[]) => void;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  eraserMode?: boolean;
  segmentEraserMode?: boolean;
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

const PEN_CONTEXT_MENU_SUPPRESS_MS = 800;

function getPenHwOverride(e: React.PointerEvent | PointerEvent): "segment-eraser" | "stroke-eraser" | null {
  if (e.pointerType !== "pen") return null;
  if (e.buttons & 32) return "segment-eraser";
  if (e.buttons & 2) return "stroke-eraser";
  return null;
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
  onSegmentErase,
  onHwOverrideChange,
  eraserMode = false,
  segmentEraserMode = false,
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
  const [erasePreview, setErasePreview] = useState<Map<number, StrokeData[]>>(new Map());
  const [eraserPos, setEraserPos] = useState<[number, number] | null>(null);
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
  const suppressContextMenuUntilRef = useRef(0);
  const effectiveModeRef = useRef<"pen" | "stroke-eraser" | "segment-eraser">("pen");

  const lastHwOverrideRef = useRef<"stroke-eraser" | "segment-eraser" | null>(null);
  const barrelHeldRef = useRef<"stroke-eraser" | "segment-eraser" | null>(null);
  const onHwOverrideChangeRef = useRef(onHwOverrideChange);
  useEffect(() => { onHwOverrideChangeRef.current = onHwOverrideChange; }, [onHwOverrideChange]);

  const reportHwOverride = useCallback((override: "stroke-eraser" | "segment-eraser" | null) => {
    if (override === lastHwOverrideRef.current) return;
    lastHwOverrideRef.current = override;
    onHwOverrideChangeRef.current?.(override);
  }, []);

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

  const applyEraserStep = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb && vb.width > 0 ? vb.width / rect.width : 1;
    const scaleY = vb && vb.height > 0 ? vb.height / rect.height : 1;
    const nx = (clientX - rect.left) * scaleX;
    const ny = (clientY - rect.top) * scaleY;
    const nr = penWidthRef.current;

    setErasePreview(prev => {
      let changed = false;
      const updated = new Map(prev);
      for (const stroke of strokes) {
        const id = stroke.id as number;
        const current: StrokeData[] = updated.has(id)
          ? updated.get(id)!
          : [{ id: stroke.id, points: stroke.points, color: stroke.color, width: stroke.width }];
        const newFrags: StrokeData[] = [];
        let fragChanged = false;
        for (const frag of current) {
          const result = eraseFromStroke(frag.points, nx, ny, nr + frag.width / 2);
          if (result === null) {
            newFrags.push(frag);
          } else {
            fragChanged = true;
            for (const pts of result) {
              newFrags.push({ points: pts, color: frag.color, width: frag.width });
            }
          }
        }
        if (fragChanged) { updated.set(id, newFrags); changed = true; }
      }
      return changed ? updated : prev;
    });
  }, [strokes]);

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

  const markPenContextMenuSuppressed = useCallback((pointerType: string) => {
    if (pointerType !== "pen") return;
    suppressContextMenuUntilRef.current = Date.now() + PEN_CONTEXT_MENU_SUPPRESS_MS;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (Date.now() <= suppressContextMenuUntilRef.current) {
      e.preventDefault();
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActivePointerType(e.pointerType);
      if (readonly || !inputEnabled) return;
      if (palmRejectionRef.current && e.pointerType === "touch" &&
          (e.width > palmThresholdRef.current || e.height > palmThresholdRef.current)) return;
      e.preventDefault();
        markPenContextMenuSuppressed(e.pointerType);
      // Fix 1: barrel-button press during hover fires pointerdown but tip is not in contact.
      // Skip starting a stroke for any non-tip button; still update toolbar override.
      if (e.pointerType === "pen" && e.button !== 0) {
        const hw = getPenHwOverride(e);
        if (hw) barrelHeldRef.current = hw;
        reportHwOverride(hw);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      // Fix 2: when tip contacts while barrel is already held, e.buttons may drop the
      // barrel bit — fall back to the barrel state tracked via pointermove.
      const hwOverride = getPenHwOverride(e) ?? barrelHeldRef.current;
      reportHwOverride(hwOverride);
      const effectiveMode = hwOverride ?? (segmentEraserMode ? "segment-eraser" : eraserMode ? "stroke-eraser" : "pen");
      effectiveModeRef.current = effectiveMode;
      if (effectiveMode === "segment-eraser") {
        setErasePreview(new Map());
        applyEraserStep(e.clientX, e.clientY);
      } else if (effectiveMode === "stroke-eraser") {
        erasedIds.current.clear();
        eraseAtPoint(e);
      } else {
        const toSvgCoords = getSvgTransform();
        const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
        livePointsRef.current = [pt];
        updateLivePath(livePointsRef.current);
      }
    },
    [readonly, inputEnabled, segmentEraserMode, eraserMode, getSvgTransform, eraseAtPoint, updateLivePath, applyEraserStep, markPenContextMenuSuppressed, reportHwOverride]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      markPenContextMenuSuppressed(e.pointerType);
      const hwOverride = getPenHwOverride(e);
      // Fix 2: track barrel state continuously so tip-contact pointerdown can read it.
      if (hwOverride) barrelHeldRef.current = hwOverride;
      reportHwOverride(hwOverride);
      const baseMode = segmentEraserMode ? "segment-eraser" : eraserMode ? "stroke-eraser" : "pen";
      const effectiveMode = drawing.current ? effectiveModeRef.current : hwOverride ?? baseMode;
      effectiveModeRef.current = effectiveMode;
      if (effectiveMode === "segment-eraser") {
        const toNatural = getSvgTransform();
        const pt = toNatural(e.clientX, e.clientY, 0);
        setEraserPos([pt[0], pt[1]]);
      } else if (eraserPos !== null) {
        setEraserPos(null);
      }
      if (!drawing.current) return;
      e.preventDefault();
      if (effectiveMode === "segment-eraser") {
        applyEraserStep(e.clientX, e.clientY);
      } else if (effectiveMode === "stroke-eraser") {
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
    [segmentEraserMode, eraserMode, eraseAtPoint, applyEraserStep, getSvgTransform, updateLivePath, activePointerType, markPenContextMenuSuppressed, eraserPos, reportHwOverride]
  );

  const finishStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const effectiveMode = effectiveModeRef.current;
    if (effectiveMode === "segment-eraser") {
      if (erasePreview.size > 0) {
        const deleted = [...erasePreview.keys()];
        const created = [...erasePreview.values()].flat();
        onSegmentErase?.(deleted, created);
      }
      setErasePreview(new Map());
      setEraserPos(null);
      reportHwOverride(null);
      return;
    }
    if (effectiveMode === "stroke-eraser") { reportHwOverride(null); return; }
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
  }, [onSegmentErase, erasePreview, reportHwOverride]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActivePointerType(e.pointerType);
      // Fix 2: clear barrel state when any button is released.
      barrelHeldRef.current = null;
      // Fix 3: always sync toolbar override on pointer-up; finishStroke only calls
      // reportHwOverride(null) when drawing.current is true, so a barrel release
      // without an active stroke would leave the toolbar stuck.
      reportHwOverride(getPenHwOverride(e));
      finishStroke();
    },
    [finishStroke, reportHwOverride]
  );

  const handlePointerLeave = useCallback(
    () => {
      setActivePointerType(null);
      barrelHeldRef.current = null;
      reportHwOverride(null);
      finishStroke();
    },
    [finishStroke, reportHwOverride]
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
          cursor: !inputEnabled ? "grab" : effectiveModeRef.current === "stroke-eraser" ? "cell" : effectiveModeRef.current === "segment-eraser" ? "none" : activePointerType === "pen" ? "none" : "default",
          display: "block",
        }}
        onPointerEnter={(e) => setActivePointerType(e.pointerType)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { setEraserPos(null); handlePointerLeave(); }}
        onContextMenu={handleContextMenu}
      >
        {strokes
          .filter(s => !erasePreview.has(s.id as number))
          .map((s, i) => {
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
        {erasePreview.size > 0 && [...erasePreview.values()].flat().map((frag, i) => {
          const outline = getStroke(frag.points, {
            thinning: thinningRef.current,
            smoothing: smoothingRef.current,
            streamline: streamlineRef.current,
            simulatePressure: simulatePressureRef.current,
            size: frag.width,
          });
          return <path key={`ef-${i}`} d={svgPathFromStroke(outline)} fill={frag.color} />;
        })}
        {effectiveModeRef.current === "segment-eraser" && eraserPos && (
          <circle
            cx={eraserPos[0]}
            cy={eraserPos[1]}
            r={penWidthRef.current}
            fill="none"
            stroke="rgba(80,80,80,0.6)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        )}
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
