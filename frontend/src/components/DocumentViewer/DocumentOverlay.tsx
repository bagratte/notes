import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import { eraseFromStroke } from "@/components/Canvas/eraserUtils";
import type { StrokeData } from "@/components/Canvas";
import type { Region, ToolMode } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";

export interface EnrichedRegion extends Region {
  note_id: number;
}

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
  onRegionUpdate?: (regionId: number, rect: DragRect) => void;
  onEraseStroke?: (id: number) => void;
  onSegmentErase?: (deleted: number[], created: StrokeData[]) => void;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  mode: ToolMode;
  viewBox?: string;
  naturalSize?: NaturalSize;
  color?: string;
  penWidth?: number;
  className?: string;
}

const MIN_REGION_PX = 10;
const PEN_CONTEXT_MENU_SUPPRESS_MS = 800;
const REGION_LONG_PRESS_MS = 450;
const REGION_PRESS_DEADZONE_PX = 8;
const REGION_HANDLE_SIZE_PX = 20;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface RegionResizeState {
  pointerId: number;
  regionId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startRect: DragRect;
}

interface RegionPressState {
  pointerId: number;
  regionId: number;
  startClientX: number;
  startClientY: number;
  timerId: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resizeRegionRect(
  rect: DragRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  naturalSize: NaturalSize
): DragRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes("w")) {
    left = clamp(rect.x + dx, 0, right - MIN_REGION_PX);
  }
  if (handle.includes("e")) {
    right = clamp(rect.x + rect.width + dx, left + MIN_REGION_PX, naturalSize.width);
  }
  if (handle.includes("n")) {
    top = clamp(rect.y + dy, 0, bottom - MIN_REGION_PX);
  }
  if (handle.includes("s")) {
    bottom = clamp(rect.y + rect.height + dy, top + MIN_REGION_PX, naturalSize.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function rectChanged(next: DragRect, prev: DragRect): boolean {
  return (
    Math.abs(next.x - prev.x) > 0.5 ||
    Math.abs(next.y - prev.y) > 0.5 ||
    Math.abs(next.width - prev.width) > 0.5 ||
    Math.abs(next.height - prev.height) > 0.5
  );
}

function getPenHwOverride(e: React.PointerEvent | PointerEvent): "segment-eraser" | "stroke-eraser" | null {
  if (e.pointerType !== "pen") return null;
  if (e.buttons & 32) return "segment-eraser";
  if (e.buttons & 2)  return "stroke-eraser";
  return null;
}

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
  onRegionUpdate,
  onEraseStroke,
  onSegmentErase,
  onHwOverrideChange,
  mode,
  viewBox,
  naturalSize,
  color = "#000000",
  penWidth = 3,
  className,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const [pendingSelection, setPendingSelection] = useState<DragRect | null>(null);
  const [activePointerType, setActivePointerType] = useState<string | null>(null);
  const [erasePreview, setErasePreview] = useState<Map<number, StrokeData[]>>(new Map());
  const [eraserPos, setEraserPos] = useState<[number, number] | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<number | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<Record<number, DragRect>>({});
  const { settings: ds } = useDrawingSettings();
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const livePointsRef = useRef<[number, number, number][]>([]);
  const erasedIds = useRef(new Set<number>());
  const strokePathCache = useRef<Map<number | string, { points: StrokeData["points"]; d: string }>>(new Map());
  const effectiveModeRef = useRef<ToolMode>("pen");
  const suppressContextMenuUntilRef = useRef(0);
  const touchPressRef = useRef<RegionPressState | null>(null);
  const resizeStateRef = useRef<RegionResizeState | null>(null);
  const suppressRegionClickRef = useRef<number | null>(null);

  const colorRef = useRef(color);
  const penWidthRef = useRef(penWidth);
  const lastHwOverrideRef = useRef<"stroke-eraser" | "segment-eraser" | null>(null);
  const onHwOverrideChangeRef = useRef(onHwOverrideChange);
  useEffect(() => { onHwOverrideChangeRef.current = onHwOverrideChange; }, [onHwOverrideChange]);

  const reportHwOverride = useCallback((override: "stroke-eraser" | "segment-eraser" | null) => {
    if (override === lastHwOverrideRef.current) return;
    lastHwOverrideRef.current = override;
    onHwOverrideChangeRef.current?.(override);
  }, []);
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

  const clearTouchPress = useCallback(() => {
    const press = touchPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timerId);
    touchPressRef.current = null;
  }, []);

  const updateRegionDraft = useCallback((regionId: number, rect: DragRect | null) => {
    setRegionDrafts((prev) => {
      if (rect === null) {
        if (!(regionId in prev)) return prev;
        const next = { ...prev };
        delete next[regionId];
        return next;
      }
      return { ...prev, [regionId]: rect };
    });
  }, []);

  const finishRegionResize = useCallback((pointerId: number, commit: boolean) => {
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== pointerId) return;

    resizeStateRef.current = null;
    const nextRect = regionDrafts[resize.regionId] ?? resize.startRect;
    updateRegionDraft(resize.regionId, null);
    setEditingRegionId((current) => (current === resize.regionId ? null : current));

    if (commit && rectChanged(nextRect, resize.startRect)) {
      suppressRegionClickRef.current = resize.regionId;
      onRegionUpdate?.(resize.regionId, nextRect);
    }
  }, [onRegionUpdate, regionDrafts, updateRegionDraft]);

  useEffect(() => {
    if (!pendingSelection) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingSelection(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingSelection]);

  useEffect(() => () => {
    clearTouchPress();
    resizeStateRef.current = null;
  }, [clearTouchPress]);

  useEffect(() => {
    if (mode === "select-region") return;
    clearTouchPress();
    resizeStateRef.current = null;
    setHoveredRegionId(null);
    setEditingRegionId(null);
    setRegionDrafts({});
    suppressRegionClickRef.current = null;
  }, [clearTouchPress, mode]);


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
    const svg = svgRef.current;
    if (!canvas || !svg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size the canvas buffer to physical pixels so strokes are sharp on HiDPI displays.
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
    // Scale from viewBox coords to physical pixels.
    const scaleX = vb.width > 0 ? physW / vb.width : dpr;
    const scaleY = vb.height > 0 ? physH / vb.height : dpr;
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
    ctx.fillStyle = colorRef.current;
    ctx.fill();
    ctx.restore();
  }, []);

  const applyEraserStep = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width > 0 ? vb.width / rect.width : 1;
    const scaleY = vb.height > 0 ? vb.height / rect.height : 1;
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

  const markPenContextMenuSuppressed = useCallback(() => {
    suppressContextMenuUntilRef.current = Date.now() + PEN_CONTEXT_MENU_SUPPRESS_MS;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (Date.now() <= suppressContextMenuUntilRef.current) {
      e.preventDefault();
    }
  }, []);

  const handleOverlayPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pendingSelection) {
      setPendingSelection(null);
      return;
    }
    if (mode !== "select-region" || editingRegionId === null) return;
    if (e.target === e.currentTarget) {
      setEditingRegionId(null);
    }
  }, [editingRegionId, mode, pendingSelection]);

  const handleRegionPointerDown = useCallback((region: EnrichedRegion, e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "select-region" || onRegionUpdate === undefined || e.pointerType !== "touch") return;
    clearTouchPress();
    const timerId = window.setTimeout(() => {
      touchPressRef.current = null;
      suppressRegionClickRef.current = region.id;
      setEditingRegionId(region.id);
    }, REGION_LONG_PRESS_MS);

    touchPressRef.current = {
      pointerId: e.pointerId,
      regionId: region.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      timerId,
    };
  }, [clearTouchPress, mode, onRegionUpdate]);

  const handleRegionPointerMove = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    const press = touchPressRef.current;
    if (!press || press.regionId !== regionId || press.pointerId !== e.pointerId) return;

    if (Math.hypot(e.clientX - press.startClientX, e.clientY - press.startClientY) >= REGION_PRESS_DEADZONE_PX) {
      clearTouchPress();
    }
  }, [clearTouchPress]);

  const handleRegionPointerUp = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    const press = touchPressRef.current;
    if (press && press.regionId === regionId && press.pointerId === e.pointerId) {
      clearTouchPress();
    }
  }, [clearTouchPress]);

  const handleRegionClick = useCallback((region: EnrichedRegion, e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressRegionClickRef.current === region.id) {
      suppressRegionClickRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (editingRegionId === region.id) {
      setEditingRegionId(null);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    onRegionClick?.(region);
  }, [editingRegionId, onRegionClick]);

  const handleRegionPointerEnter = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "select-region" || onRegionUpdate === undefined || e.pointerType === "touch") return;
    setHoveredRegionId(regionId);
  }, [mode, onRegionUpdate]);

  const handleRegionPointerLeave = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "select-region" || onRegionUpdate === undefined || e.pointerType === "touch") return;
    setHoveredRegionId((current) => (current === regionId ? null : current));
  }, [mode, onRegionUpdate]);

  const handleResizePointerDown = useCallback(
    (region: EnrichedRegion, handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== "select-region" || naturalSize === undefined || onRegionUpdate === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      clearTouchPress();
      suppressRegionClickRef.current = region.id;
      setEditingRegionId(region.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeStateRef.current = {
        pointerId: e.pointerId,
        regionId: region.id,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRect: regionDrafts[region.id] ?? {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        },
      };
    },
    [clearTouchPress, mode, naturalSize, onRegionUpdate, regionDrafts]
  );

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current;
    const overlay = overlayRef.current;
    if (!resize || resize.pointerId !== e.pointerId || naturalSize === undefined || !overlay) return;

    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dx = (e.clientX - resize.startClientX) * (naturalSize.width / rect.width);
    const dy = (e.clientY - resize.startClientY) * (naturalSize.height / rect.height);
    updateRegionDraft(
      resize.regionId,
      resizeRegionRect(resize.startRect, resize.handle, dx, dy, naturalSize)
    );
  }, [naturalSize, updateRegionDraft]);

  const handleResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.currentTarget.releasePointerCapture(e.pointerId);
    finishRegionResize(e.pointerId, true);
  }, [finishRegionResize]);

  const handleResizePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    finishRegionResize(e.pointerId, false);
  }, [finishRegionResize]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActivePointerType(e.pointerType);
      if (palmRejectionRef.current && e.pointerType === "touch" &&
          (e.width > palmThresholdRef.current || e.height > palmThresholdRef.current)) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const toSvgCoords = getSvgTransform();
      const pt = toSvgCoords(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
      drawing.current = true;
      const hwOverride = getPenHwOverride(e);
      if (hwOverride) markPenContextMenuSuppressed();
      reportHwOverride(hwOverride);
      const effectiveMode = hwOverride ?? mode;
      effectiveModeRef.current = effectiveMode;
      if (effectiveMode === "pen") {
        livePointsRef.current = [pt];
        updateLivePath(livePointsRef.current);
      } else if (effectiveMode === "stroke-eraser") {
        erasedIds.current.clear();
        eraseAtPoint(e, false);
      } else if (effectiveMode === "segment-eraser") {
        setErasePreview(new Map());
        applyEraserStep(e.clientX, e.clientY);
      } else if (effectiveMode === "select-region") {
        setDragStart([pt[0], pt[1]]);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, getSvgTransform, eraseAtPoint, updateLivePath, applyEraserStep, markPenContextMenuSuppressed, reportHwOverride]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerType !== e.pointerType) {
        setActivePointerType(e.pointerType);
      }
      const hwOverride = getPenHwOverride(e);
      if (hwOverride) markPenContextMenuSuppressed();
      reportHwOverride(hwOverride);
      const effectiveMode = hwOverride ?? mode;
      effectiveModeRef.current = effectiveMode;
      if (effectiveMode === "segment-eraser") {
        const toNatural = getSvgTransform();
        const pt = toNatural(e.clientX, e.clientY, 0);
        setEraserPos([pt[0], pt[1]]);
      }
      if (!drawing.current) return;
      e.preventDefault();
      if (effectiveMode === "pen") {
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
      } else if (effectiveMode === "stroke-eraser") {
        eraseAtPoint(e, false);
      } else if (effectiveMode === "segment-eraser") {
        applyEraserStep(e.clientX, e.clientY);
      } else if (effectiveMode === "select-region") {
        const pt = getSvgTransform()(e.clientX, e.clientY, normalizePressure(e.pressure, e.pointerType));
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, getSvgTransform, eraseAtPoint, updateLivePath, applyEraserStep, activePointerType, markPenContextMenuSuppressed, reportHwOverride]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
    if (!drawing.current) return;
    drawing.current = false;

    const effectiveMode = effectiveModeRef.current;
    if (effectiveMode === "pen") {
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
    } else if (effectiveMode === "segment-eraser") {
      if (erasePreview.size > 0) {
        const deleted = [...erasePreview.keys()];
        const created = [...erasePreview.values()].flat();
        onSegmentErase?.(deleted, created);
        setErasePreview(new Map());
      }
    } else if (effectiveMode === "select-region") {
      if (dragStart && dragCurrent) {
        const x = Math.min(dragStart[0], dragCurrent[0]);
        const y = Math.min(dragStart[1], dragCurrent[1]);
        const w = Math.abs(dragCurrent[0] - dragStart[0]);
        const h = Math.abs(dragCurrent[1] - dragStart[1]);
        if (w > MIN_REGION_PX && h > MIN_REGION_PX) {
          setPendingSelection({ x, y, width: w, height: h });
        }
      }
      setDragStart(null);
      setDragCurrent(null);
    }
    reportHwOverride(null);
  }, [onSegmentErase, erasePreview, dragStart, dragCurrent, reportHwOverride]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    handlePointerUp(e);
    setActivePointerType(null);
    setEraserPos(null);
    reportHwOverride(null);
    effectiveModeRef.current = "pen";
  }, [handlePointerUp, reportHwOverride]);

  const dragRect: DragRect | null =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart[0], dragCurrent[0]),
          y: Math.min(dragStart[1], dragCurrent[1]),
          width: Math.abs(dragCurrent[0] - dragStart[0]),
          height: Math.abs(dragCurrent[1] - dragStart[1]),
        }
      : null;

  return (
    <div
      ref={overlayRef}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      onPointerDownCapture={handleOverlayPointerDownCapture}
    >
      {/* Region boxes — clickable divs so they work independently of SVG pointer-events */}
      {naturalSize &&
        regions.map((r) => {
          const rect = regionDrafts[r.id] ?? {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
          const showHandles = mode === "select-region" && onRegionUpdate !== undefined && (editingRegionId === r.id || hoveredRegionId === r.id);
          const isEditing = editingRegionId === r.id;
          const handleDescriptors: Array<{ key: ResizeHandle; left: string; top: string; cursor: string }> = [
            { key: "nw", left: "0%", top: "0%", cursor: "nwse-resize" },
            { key: "ne", left: "100%", top: "0%", cursor: "nesw-resize" },
            { key: "sw", left: "0%", top: "100%", cursor: "nesw-resize" },
            { key: "se", left: "100%", top: "100%", cursor: "nwse-resize" },
          ];

          return (
            <div
              key={r.id}
              onClick={(e) => handleRegionClick(r, e)}
              onPointerDown={(e) => handleRegionPointerDown(r, e)}
              onPointerMove={(e) => handleRegionPointerMove(r.id, e)}
              onPointerUp={(e) => handleRegionPointerUp(r.id, e)}
              onPointerCancel={(e) => handleRegionPointerUp(r.id, e)}
              onPointerEnter={(e) => handleRegionPointerEnter(r.id, e)}
              onPointerLeave={(e) => handleRegionPointerLeave(r.id, e)}
              title={showHandles ? "Drag a corner handle to resize" : "Open linked note"}
              style={{
                position: "absolute",
                left: `${(rect.x / naturalSize.width) * 100}%`,
                top: `${(rect.y / naturalSize.height) * 100}%`,
                width: `${(rect.width / naturalSize.width) * 100}%`,
                height: `${(rect.height / naturalSize.height) * 100}%`,
                background: isEditing ? "rgba(74, 108, 247, 0.16)" : "rgba(74, 108, 247, 0.1)",
                border: isEditing ? "2px solid rgba(74, 108, 247, 0.9)" : "1.5px solid rgba(74, 108, 247, 0.55)",
                borderRadius: 2,
                boxSizing: "border-box",
                cursor: mode === "select-region" ? "pointer" : "default",
                pointerEvents: mode === "select-region" ? "auto" : "none",
                zIndex: isEditing ? 3 : 1,
                transition: "background 0.15s, border 0.15s, box-shadow 0.15s",
                boxShadow: isEditing ? "0 0 0 2px rgba(255, 255, 255, 0.9) inset" : undefined,
                touchAction: isEditing ? "none" : "auto",
              }}
            >
              {showHandles && handleDescriptors.map((handleDesc) => (
                <div
                  key={handleDesc.key}
                  onPointerDown={(e) => handleResizePointerDown(r, handleDesc.key, e)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerCancel}
                  style={{
                    position: "absolute",
                    left: handleDesc.left,
                    top: handleDesc.top,
                    width: REGION_HANDLE_SIZE_PX,
                    height: REGION_HANDLE_SIZE_PX,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    background: "#ffffff",
                    border: "2px solid rgba(74, 108, 247, 0.9)",
                    boxSizing: "border-box",
                    cursor: handleDesc.cursor,
                    touchAction: "none",
                    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.18)",
                  }}
                />
              ))}
            </div>
          );
        })}

      {/* Pending select-region: backdrop to dismiss + contextual menu */}
      {pendingSelection && naturalSize && (
        <>
          <div
            style={{
              position: "absolute",
              left: `${(pendingSelection.x / naturalSize.width) * 100}%`,
              top: `${(pendingSelection.y / naturalSize.height) * 100}%`,
              width: `${(pendingSelection.width / naturalSize.width) * 100}%`,
              height: `${(pendingSelection.height / naturalSize.height) * 100}%`,
              background: "rgba(74, 108, 247, 0.08)",
              border: "1.5px dashed rgba(74, 108, 247, 0.7)",
              borderRadius: 2,
              boxSizing: "border-box",
              pointerEvents: "none",
              zIndex: 100,
            }}
          />
          <div
            style={{ position: "absolute", inset: 0, zIndex: 101 }}
            onPointerDown={() => setPendingSelection(null)}
          />
          <div
            style={{
              position: "absolute",
              left: `${(pendingSelection.x / naturalSize.width) * 100}%`,
              top: `${Math.min(
                ((pendingSelection.y + pendingSelection.height) / naturalSize.height) * 100,
                80
              )}%`,
              zIndex: 102,
              background: "#fff",
              border: "1px solid #e0dbd3",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              overflow: "hidden",
              minWidth: 140,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                fontSize: 13,
                cursor: "pointer",
                color: "#2a2a2a",
                whiteSpace: "nowrap",
              }}
              onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              onClick={() => {
                const sel = pendingSelection;
                setPendingSelection(null);
                if (sel) onRegionComplete?.(sel);
              }}
            >
              Create Note
            </button>
          </div>
        </>
      )}

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
          touchAction: "none",
          pointerEvents: pendingSelection === null ? "all" : "none",
          cursor:
            effectiveModeRef.current === "pen" ? (activePointerType === "pen" ? "none" : "default") : effectiveModeRef.current === "select-region" ? "crosshair" : effectiveModeRef.current === "stroke-eraser" ? "cell" : effectiveModeRef.current === "segment-eraser" ? "none" : "default",
        }}
        onPointerEnter={(e) => setActivePointerType(e.pointerType)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      >
        {strokes
          .filter(s => !erasePreview.has(s.id as number))
          .map((s, i) => {
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
