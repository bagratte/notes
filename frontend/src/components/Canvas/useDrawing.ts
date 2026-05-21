import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { eraseFromStroke } from "./eraserUtils";
import type { StrokeData } from "./types";
import type { ToolMode } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";
import { flipLightness } from "./utils";

const PEN_CONTEXT_MENU_SUPPRESS_MS = 800;

export function getPenHwOverride(e: React.PointerEvent | PointerEvent): "segment-eraser" | "stroke-eraser" | null {
  if (e.pointerType !== "pen") return null;
  if (e.buttons & 32) return "segment-eraser";
  if (e.buttons & 2) return "stroke-eraser";
  return null;
}

export function normalizePressure(
  pressure: number,
  pointerType: string,
  multiplier = 1.0,
  gamma = 1.0,
): number {
  if (pointerType === "pen") {
    if (pressure > 0) {
      const scaled = Math.min(1, pressure * multiplier);
      const curved = gamma === 1.0 ? scaled : Math.pow(scaled, gamma);
      return Math.min(1, Math.max(0.12, curved));
    }
    return 0.2;
  }
  return pressure > 0 ? pressure : 0.5;
}

export interface UseDrawingOptions {
  strokes: StrokeData[];
  mode: ToolMode;
  color: string;
  penWidth: number;
  isDark?: boolean;
  viewBox?: string;
  inputEnabled?: boolean;
  readonly?: boolean;
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  onSegmentErase?: (deleted: number[], created: StrokeData[]) => void;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  onSelectRegionStart?: (pt: [number, number]) => void;
  onSelectRegionMove?: (pt: [number, number]) => void;
  onSelectRegionEnd?: () => void;
}

export interface UseDrawingResult {
  svgRef: React.RefObject<SVGSVGElement>;
  liveCanvasRef: React.RefObject<HTMLCanvasElement>;
  activePointerType: string | null;
  erasePreview: Map<number, StrokeData[]>;
  eraserPos: [number, number] | null;
  effectiveModeRef: React.MutableRefObject<ToolMode>;
  strokePathCache: React.MutableRefObject<Map<number | StrokeData, { points: StrokeData["points"]; d: string }>>;
  svgHandlers: {
    onPointerEnter: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerLeave: (e: React.PointerEvent<SVGSVGElement>) => void;
    onContextMenu: (e: React.MouseEvent<SVGSVGElement>) => void;
  };
  transferPointerToSvg: (e: React.PointerEvent) => void;
  reportHwOverride: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  barrelHeldRef: React.MutableRefObject<"stroke-eraser" | "segment-eraser" | null>;
  markPenContextMenuSuppressed: () => void;
}

export function useDrawing({
  strokes,
  mode,
  color,
  penWidth,
  isDark = false,
  inputEnabled = true,
  readonly = false,
  onStrokeComplete,
  onEraseStroke,
  onSegmentErase,
  onHwOverrideChange,
  onSelectRegionStart,
  onSelectRegionMove,
  onSelectRegionEnd,
}: UseDrawingOptions): UseDrawingResult {
  const [activePointerType, setActivePointerType] = useState<string | null>(null);
  const [erasePreview, setErasePreview] = useState<Map<number, StrokeData[]>>(new Map());
  const [eraserPos, setEraserPos] = useState<[number, number] | null>(null);
  const { settings: ds } = useDrawingSettings();

  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());
  const strokePathCache = useRef<Map<number | StrokeData, { points: StrokeData["points"]; d: string }>>(new Map());
  const effectiveModeRef = useRef<ToolMode>(mode);
  const suppressContextMenuUntilRef = useRef(0);

  const colorRef = useRef(color);
  const isDarkRef = useRef(isDark);
  const penWidthRef = useRef(penWidth);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const streamlineRef = useRef(ds.streamline);
  const predictiveRef = useRef(ds.predictive);
  const thinningRef = useRef(ds.thinning);
  const smoothingRef = useRef(ds.smoothing);
  const simulatePressureRef = useRef(ds.simulatePressure);
  const palmRejectionRef = useRef(ds.palmRejection);
  const palmThresholdRef = useRef(ds.palmThreshold);
  const pressureMultiplierRef = useRef(ds.pressureMultiplier);
  const pressureGammaRef = useRef(ds.pressureGamma);
  const lastHwOverrideRef = useRef<"stroke-eraser" | "segment-eraser" | null>(null);
  const barrelHeldRef = useRef<"stroke-eraser" | "segment-eraser" | null>(null);
  const onHwOverrideChangeRef = useRef(onHwOverrideChange);

  const onSelectRegionStartRef = useRef(onSelectRegionStart);
  const onSelectRegionMoveRef = useRef(onSelectRegionMove);
  const onSelectRegionEndRef = useRef(onSelectRegionEnd);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
  useEffect(() => { onHwOverrideChangeRef.current = onHwOverrideChange; }, [onHwOverrideChange]);
  useEffect(() => { onSelectRegionStartRef.current = onSelectRegionStart; }, [onSelectRegionStart]);
  useEffect(() => { onSelectRegionMoveRef.current = onSelectRegionMove; }, [onSelectRegionMove]);
  useEffect(() => { onSelectRegionEndRef.current = onSelectRegionEnd; }, [onSelectRegionEnd]);
  useEffect(() => { streamlineRef.current = ds.streamline; }, [ds.streamline]);
  useEffect(() => { predictiveRef.current = ds.predictive; }, [ds.predictive]);
  useEffect(() => { thinningRef.current = ds.thinning; }, [ds.thinning]);
  useEffect(() => { smoothingRef.current = ds.smoothing; }, [ds.smoothing]);
  useEffect(() => { simulatePressureRef.current = ds.simulatePressure; }, [ds.simulatePressure]);
  useEffect(() => { palmRejectionRef.current = ds.palmRejection; }, [ds.palmRejection]);
  useEffect(() => { palmThresholdRef.current = ds.palmThreshold; }, [ds.palmThreshold]);
  useEffect(() => { pressureMultiplierRef.current = ds.pressureMultiplier; }, [ds.pressureMultiplier]);
  useEffect(() => { pressureGammaRef.current = ds.pressureGamma; }, [ds.pressureGamma]);
  useEffect(() => { strokePathCache.current.clear(); }, [ds.streamline, ds.thinning, ds.smoothing, ds.simulatePressure]);

  const reportHwOverride = useCallback((override: "stroke-eraser" | "segment-eraser" | null) => {
    if (override === lastHwOverrideRef.current) return;
    lastHwOverrideRef.current = override;
    onHwOverrideChangeRef.current?.(override);
  }, []);

  const markPenContextMenuSuppressed = useCallback(() => {
    suppressContextMenuUntilRef.current = Date.now() + PEN_CONTEXT_MENU_SUPPRESS_MS;
  }, []);

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
    const svg = svgRef.current;
    if (!canvas || !svg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const physW = Math.round(rect.width * dpr);
    const physH = Math.round(rect.height * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }

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
    const scaleX = vb && vb.width > 0 ? physW / vb.width : dpr;
    const scaleY = vb && vb.height > 0 ? physH / vb.height : dpr;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = isDarkRef.current ? flipLightness(colorRef.current) : colorRef.current;
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

  const eraseAtPoint = useCallback((e: React.PointerEvent, firstOnly: boolean) => {
    const samples: [number, number][] = firstOnly
      ? [[e.clientX, e.clientY]]
      : [
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
        if (firstOnly) return;
      }
    }
  }, [onEraseStroke]);

  const clearLiveCanvas = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const finishStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const em = effectiveModeRef.current;

    if (em === "segment-eraser") {
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
    if (em === "stroke-eraser") {
      reportHwOverride(null);
      return;
    }
    if (em === "select-region") {
      onSelectRegionEndRef.current?.();
      return;
    }
    const pts = livePointsRef.current;
    if (pts.length > 0) {
      onStrokeCompleteRef.current?.({ points: [...pts], color: colorRef.current, width: penWidthRef.current });
    }
    livePointsRef.current = [];
    clearLiveCanvas();
  }, [erasePreview, onSegmentErase, reportHwOverride, clearLiveCanvas]);

  // Called by both handlePointerDown and transferPointerToSvg to start a drawing gesture.
  const beginDrawing = useCallback((e: React.PointerEvent, resolvedMode: ToolMode) => {
    effectiveModeRef.current = resolvedMode;
    if (resolvedMode === "pen" || resolvedMode === "auto") {
      const toSvgCoords = getSvgTransform();
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType, pressureMultiplierRef.current, pressureGammaRef.current));
      livePointsRef.current = [pt];
      updateLivePath(livePointsRef.current);
    } else if (resolvedMode === "stroke-eraser") {
      erasedIds.current.clear();
      eraseAtPoint(e, false);
    } else if (resolvedMode === "segment-eraser") {
      setErasePreview(new Map());
      applyEraserStep(e.clientX, e.clientY);
    } else if (resolvedMode === "select-region") {
      const toSvgCoords = getSvgTransform();
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType, pressureMultiplierRef.current, pressureGammaRef.current));
      onSelectRegionStartRef.current?.([pt[0], pt[1]]);
    }
  }, [getSvgTransform, updateLivePath, eraseAtPoint, applyEraserStep]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
    if (readonly || !inputEnabled) return;
    if (mode === "hand") return;
    if (mode === "auto" && e.pointerType !== "pen") return;
    if (palmRejectionRef.current && e.pointerType === "touch" &&
        (e.width > palmThresholdRef.current || e.height > palmThresholdRef.current)) return;
    if (e.button !== 0 && e.pointerType !== "pen") return;
    e.preventDefault();
    if (e.pointerType === "pen" && e.button !== 0) {
      markPenContextMenuSuppressed();
      const hw = getPenHwOverride(e);
      if (hw) barrelHeldRef.current = hw;
      reportHwOverride(hw);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const hwOverride = getPenHwOverride(e) ?? barrelHeldRef.current;
    if (hwOverride) markPenContextMenuSuppressed();
    reportHwOverride(hwOverride);
    beginDrawing(e, hwOverride ?? mode);
  }, [readonly, inputEnabled, mode, beginDrawing, markPenContextMenuSuppressed, reportHwOverride]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
    if (e.pointerType === "pen") markPenContextMenuSuppressed();
    const hwOverride = getPenHwOverride(e);
    if (hwOverride) barrelHeldRef.current = hwOverride;
    reportHwOverride(hwOverride);
    // Lock effective mode during a stroke; outside of drawing, reflect current tool + hw override.
    const resolvedMode = drawing.current ? effectiveModeRef.current : hwOverride ?? mode;
    effectiveModeRef.current = resolvedMode;

    if (resolvedMode === "segment-eraser") {
      const toNatural = getSvgTransform();
      const pt = toNatural(e.clientX, e.clientY, 0);
      setEraserPos([pt[0], pt[1]]);
    } else {
      setEraserPos(null);
    }

    if (!drawing.current) return;
    e.preventDefault();

    if (resolvedMode === "pen" || resolvedMode === "auto") {
      const coalescedEvents = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent as PointerEvent];
      const toSvgCoords = getSvgTransform();
      const pts = livePointsRef.current;
      for (const ce of coalescedEvents) {
        pts.push(toSvgCoords(ce.clientX, ce.clientY, normalizePressure(ce.pressure, ce.pointerType, pressureMultiplierRef.current, pressureGammaRef.current)));
      }
      const predictedEvents = predictiveRef.current
        ? (e.nativeEvent as PointerEvent).getPredictedEvents?.() ?? []
        : [];
      const drawPts: [number, number, number][] = predictedEvents.length > 0
        ? [...pts, ...predictedEvents.map((pe) => toSvgCoords(pe.clientX, pe.clientY, normalizePressure(pe.pressure, pe.pointerType, pressureMultiplierRef.current, pressureGammaRef.current)))]
        : pts;
      updateLivePath(drawPts);
    } else if (resolvedMode === "stroke-eraser") {
      eraseAtPoint(e, false);
    } else if (resolvedMode === "segment-eraser") {
      applyEraserStep(e.clientX, e.clientY);
    } else if (resolvedMode === "select-region") {
      const toSvgCoords = getSvgTransform();
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType, pressureMultiplierRef.current, pressureGammaRef.current));
      onSelectRegionMoveRef.current?.([pt[0], pt[1]]);
    }
  }, [mode, getSvgTransform, updateLivePath, eraseAtPoint, applyEraserStep, markPenContextMenuSuppressed, reportHwOverride]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
    barrelHeldRef.current = null;
    reportHwOverride(getPenHwOverride(e));
    finishStroke();
  }, [finishStroke, reportHwOverride]);

  const handlePointerLeave = useCallback((_e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(null);
    setEraserPos(null);
    barrelHeldRef.current = null;
    reportHwOverride(null);
    finishStroke();
  }, [finishStroke, reportHwOverride]);

  const handleContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (Date.now() <= suppressContextMenuUntilRef.current) {
      e.preventDefault();
    }
  }, []);

  // Transfers an existing pointer from a region div to the SVG and begins a drawing gesture.
  // Used by DocumentOverlay in auto mode when a stylus lands on a region.
  const transferPointerToSvg = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setActivePointerType(e.pointerType);
    drawing.current = true;
    const hwOverride = getPenHwOverride(e) ?? barrelHeldRef.current;
    if (hwOverride) markPenContextMenuSuppressed();
    reportHwOverride(hwOverride);
    beginDrawing(e, hwOverride ?? mode);
  }, [mode, beginDrawing, markPenContextMenuSuppressed, reportHwOverride]);

  return {
    svgRef,
    liveCanvasRef,
    activePointerType,
    erasePreview,
    eraserPos,
    effectiveModeRef,
    strokePathCache,
    svgHandlers: {
      onPointerEnter: (e) => setActivePointerType(e.pointerType),
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onContextMenu: handleContextMenu,
    },
    transferPointerToSvg,
    reportHwOverride,
    barrelHeldRef,
    markPenContextMenuSuppressed,
  };
}
