import { useState, useRef, useCallback, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import { useDrawing, getPenHwOverride } from "@/components/Canvas/useDrawing";
import type { StrokeData } from "@/components/Canvas";
import type { Note, Region, ToolMode } from "@/types";
import { notes as notesApi } from "@/api";
import { useDrawingSettings } from "@/context/DrawingSettings";
import { useTouchMode } from "@/context/TouchMode";
import NoteStrokePreview from "./NoteStrokePreview";

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
  onRegionAddToNote?: (rect: DragRect, noteId: number) => void;
  onRegionClick?: (region: EnrichedRegion) => void;
  onRegionUpdate?: (regionId: number, rect: DragRect) => void;
  onRegionDelete?: (region: EnrichedRegion) => void;
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
const REGION_HANDLE_SIZE_PX = 28;
const REGION_LONG_PRESS_MS = 450;
const REGION_PRESS_DEADZONE_PX = 8;

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
type HandleKind = "corner" | "edge-h" | "edge-v";

interface ResizeHandleDescriptor {
  key: ResizeHandle;
  left: string;
  top: string;
  cursor: string;
  kind: HandleKind;
}

const REGION_HANDLE_DESCRIPTORS: ResizeHandleDescriptor[] = [
  { key: "nw", left: "0%", top: "0%", cursor: "nwse-resize", kind: "corner" },
  { key: "ne", left: "100%", top: "0%", cursor: "nesw-resize", kind: "corner" },
  { key: "sw", left: "0%", top: "100%", cursor: "nesw-resize", kind: "corner" },
  { key: "se", left: "100%", top: "100%", cursor: "nwse-resize", kind: "corner" },
  { key: "n", left: "50%", top: "0%", cursor: "ns-resize", kind: "edge-h" },
  { key: "s", left: "50%", top: "100%", cursor: "ns-resize", kind: "edge-h" },
  { key: "w", left: "0%", top: "50%", cursor: "ew-resize", kind: "edge-v" },
  { key: "e", left: "100%", top: "50%", cursor: "ew-resize", kind: "edge-v" },
];

interface RegionResizeState {
  pointerId: number;
  regionId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startRect: DragRect;
}

interface PendingResizeState {
  pointerId: number;
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

  if (handle.includes("w")) left = clamp(rect.x + dx, 0, right - MIN_REGION_PX);
  if (handle.includes("e")) right = clamp(rect.x + rect.width + dx, left + MIN_REGION_PX, naturalSize.width);
  if (handle.includes("n")) top = clamp(rect.y + dy, 0, bottom - MIN_REGION_PX);
  if (handle.includes("s")) bottom = clamp(rect.y + rect.height + dy, top + MIN_REGION_PX, naturalSize.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function rectChanged(next: DragRect, prev: DragRect): boolean {
  return (
    Math.abs(next.x - prev.x) > 0.5 ||
    Math.abs(next.y - prev.y) > 0.5 ||
    Math.abs(next.width - prev.width) > 0.5 ||
    Math.abs(next.height - prev.height) > 0.5
  );
}

function getHandleVisualStyle(handle: ResizeHandleDescriptor): React.CSSProperties {
  const isCorner = handle.kind === "corner";
  const isEdgeH = handle.kind === "edge-h";

  if (isCorner) {
    return {
      width: 12,
      height: 12,
      background: "transparent",
      borderTop: handle.key.includes("n") ? "2.5px solid rgba(74, 108, 247, 0.95)" : undefined,
      borderBottom: handle.key.includes("s") ? "2.5px solid rgba(74, 108, 247, 0.95)" : undefined,
      borderLeft: handle.key.includes("w") ? "2.5px solid rgba(74, 108, 247, 0.95)" : undefined,
      borderRight: handle.key.includes("e") ? "2.5px solid rgba(74, 108, 247, 0.95)" : undefined,
      filter: "drop-shadow(0 0 1.5px white) drop-shadow(0 0 2px rgba(0,0,0,0.25))",
      boxSizing: "border-box",
    };
  }

  return {
    width: isEdgeH ? 22 : 5,
    height: isEdgeH ? 5 : 22,
    background: "white",
    border: "1.5px solid rgba(74, 108, 247, 0.9)",
    borderRadius: 3,
    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
    boxSizing: "border-box",
  };
}

export default function DocumentOverlay({
  strokes,
  onStrokeComplete,
  regions,
  onRegionComplete,
  onRegionAddToNote,
  onRegionClick,
  onRegionUpdate,
  onRegionDelete,
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
  const [addToNoteOpen, setAddToNoteOpen] = useState(false);
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [hoveredNoteId, setHoveredNoteId] = useState<number | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isTouch } = useTouchMode();
  const [editingRegionId, setEditingRegionId] = useState<number | null>(null);
  const [regionMenu, setRegionMenu] = useState<{ regionId: number; x: number; y: number } | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<Record<number, DragRect>>({});
  const { settings: ds } = useDrawingSettings();

  const touchPressRef = useRef<RegionPressState | null>(null);
  const resizeStateRef = useRef<RegionResizeState | null>(null);
  const pendingResizeStateRef = useRef<PendingResizeState | null>(null);
  const suppressRegionClickRef = useRef<number | null>(null);

  const onSelectRegionEnd = useCallback(() => {
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
  }, [dragStart, dragCurrent]);

  const {
    svgRef,
    liveCanvasRef,
    activePointerType,
    erasePreview,
    eraserPos,
    effectiveModeRef,
    strokePathCache,
    svgHandlers,
    transferPointerToSvg,
    reportHwOverride,
    barrelHeldRef,
    markPenContextMenuSuppressed,
  } = useDrawing({
    strokes,
    mode,
    color,
    penWidth,
    viewBox,
    onStrokeComplete,
    onEraseStroke,
    onSegmentErase,
    onHwOverrideChange,
    onSelectRegionStart: (pt) => { setDragStart(pt); setDragCurrent(pt); },
    onSelectRegionMove: (pt) => setDragCurrent(pt),
    onSelectRegionEnd,
  });

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
      if (e.key === "Escape") {
        setPendingSelection(null);
        setAddToNoteOpen(false);
        setNotesList([]);
        setHoveredNoteId(null);
        setPreviewPos(null);
        setSelectedNoteId(null);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingSelection]);

  useEffect(() => () => {
    clearTouchPress();
    resizeStateRef.current = null;
    pendingResizeStateRef.current = null;
  }, [clearTouchPress]);

  useEffect(() => {
    if (mode === "hand") return;
    clearTouchPress();
    resizeStateRef.current = null;
    pendingResizeStateRef.current = null;
    setEditingRegionId(null);
    setRegionMenu(null);
    setRegionDrafts({});
    suppressRegionClickRef.current = null;
  }, [clearTouchPress, mode]);

  const handleOverlayPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((mode !== "hand" && mode !== "auto") || editingRegionId === null) return;
    if (e.target === e.currentTarget) setEditingRegionId(null);
  }, [editingRegionId, mode]);

  const handleRegionPointerDown = useCallback((region: EnrichedRegion, e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === "auto" && e.pointerType === "pen") {
      e.preventDefault();
      if (e.button !== 0) {
        markPenContextMenuSuppressed();
        const hw = getPenHwOverride(e);
        if (hw) barrelHeldRef.current = hw;
        reportHwOverride(hw);
        return;
      }
      transferPointerToSvg(e);
      return;
    }
    if (mode !== "hand" && mode !== "auto") return;
    if (e.pointerType !== "touch") return;
    clearTouchPress();
    const timerId = window.setTimeout(() => {
      const press = touchPressRef.current;
      touchPressRef.current = null;
      suppressRegionClickRef.current = region.id;
      setRegionMenu({ regionId: region.id, x: press?.startClientX ?? 0, y: press?.startClientY ?? 0 });
    }, REGION_LONG_PRESS_MS);
    touchPressRef.current = {
      pointerId: e.pointerId,
      regionId: region.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      timerId,
    };
  }, [mode, transferPointerToSvg, reportHwOverride, barrelHeldRef, markPenContextMenuSuppressed, clearTouchPress]);

  const handleRegionPointerMove = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    const press = touchPressRef.current;
    if (!press || press.regionId !== regionId || press.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - press.startClientX, e.clientY - press.startClientY) >= REGION_PRESS_DEADZONE_PX) {
      clearTouchPress();
    }
  }, [clearTouchPress]);

  const handleRegionPointerUp = useCallback((regionId: number, e: React.PointerEvent<HTMLDivElement>) => {
    const press = touchPressRef.current;
    if (press && press.regionId === regionId && press.pointerId === e.pointerId) clearTouchPress();
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

  const handleRegionContextMenu = useCallback((region: EnrichedRegion, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setRegionMenu({ regionId: region.id, x: e.clientX, y: e.clientY });
  }, []);

  const handleResizePointerDown = useCallback(
    (region: EnrichedRegion, handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
      if ((mode !== "hand" && mode !== "auto") || naturalSize === undefined || onRegionUpdate === undefined) return;
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
        startRect: regionDrafts[region.id] ?? { x: region.x, y: region.y, width: region.width, height: region.height },
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
    updateRegionDraft(resize.regionId, resizeRegionRect(resize.startRect, resize.handle, dx, dy, naturalSize));
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

  const handlePendingResizePointerDown = useCallback(
    (handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
      if (!pendingSelection || naturalSize === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      pendingResizeStateRef.current = {
        pointerId: e.pointerId,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRect: pendingSelection,
      };
    },
    [pendingSelection, naturalSize]
  );

  const handlePendingResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const resize = pendingResizeStateRef.current;
      const overlay = overlayRef.current;
      if (!resize || resize.pointerId !== e.pointerId || naturalSize === undefined || !overlay) return;
      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (e.clientX - resize.startClientX) * (naturalSize.width / rect.width);
      const dy = (e.clientY - resize.startClientY) * (naturalSize.height / rect.height);
      setPendingSelection(resizeRegionRect(resize.startRect, resize.handle, dx, dy, naturalSize));
    },
    [naturalSize]
  );

  const handlePendingResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const resize = pendingResizeStateRef.current;
      if (!resize || resize.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.currentTarget.releasePointerCapture(e.pointerId);
      pendingResizeStateRef.current = null;
    },
    []
  );

  const handlePendingResizePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const resize = pendingResizeStateRef.current;
      if (!resize || resize.pointerId !== e.pointerId) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      pendingResizeStateRef.current = null;
      setPendingSelection(resize.startRect);
    },
    []
  );

  const dragRect: DragRect | null =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart[0], dragCurrent[0]),
          y: Math.min(dragStart[1], dragCurrent[1]),
          width: Math.abs(dragCurrent[0] - dragStart[0]),
          height: Math.abs(dragCurrent[1] - dragStart[1]),
        }
      : null;

  const active = mode !== "hand";
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
          const rect = regionDrafts[r.id] ?? { x: r.x, y: r.y, width: r.width, height: r.height };
          const showHandles = (mode === "hand" || mode === "auto") && onRegionUpdate !== undefined && editingRegionId === r.id;
          const isEditing = editingRegionId === r.id;

          return (
            <div
              key={r.id}
              onClick={(e) => handleRegionClick(r, e)}
              onPointerDown={(e) => handleRegionPointerDown(r, e)}
              onPointerMove={(e) => handleRegionPointerMove(r.id, e)}
              onPointerUp={(e) => handleRegionPointerUp(r.id, e)}
              onPointerCancel={(e) => handleRegionPointerUp(r.id, e)}
              onContextMenu={(e) => handleRegionContextMenu(r, e)}
              title={showHandles ? "Drag a handle to resize" : "Open linked note"}
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
                cursor: (mode === "hand" || mode === "auto") ? "pointer" : "default",
                pointerEvents: (mode === "hand" || mode === "auto") ? "auto" : "none",
                zIndex: isEditing ? 3 : 1,
                transition: "background 0.15s, border 0.15s, box-shadow 0.15s",
                boxShadow: isEditing ? "0 0 0 2px rgba(255, 255, 255, 0.9) inset" : undefined,
                touchAction: isEditing ? "none" : "auto",
              }}
            >
              {showHandles && REGION_HANDLE_DESCRIPTORS.map((h) => {
                const visualStyle = getHandleVisualStyle(h);
                return (
                  <div
                    key={h.key}
                    onPointerDown={(e) => handleResizePointerDown(r, h.key, e)}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerUp}
                    onPointerCancel={handleResizePointerCancel}
                    style={{
                      position: "absolute",
                      left: h.left,
                      top: h.top,
                      width: REGION_HANDLE_SIZE_PX,
                      height: REGION_HANDLE_SIZE_PX,
                      transform: "translate(-50%, -50%)",
                      cursor: h.cursor,
                      touchAction: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div style={{ ...visualStyle, pointerEvents: "none" }} />
                  </div>
                );
              })}
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
              pointerEvents: "auto",
              zIndex: 103,
              touchAction: "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {REGION_HANDLE_DESCRIPTORS.map((handleDesc) => {
              const visualStyle = getHandleVisualStyle(handleDesc);
              return (
              <div
                key={handleDesc.key}
                onPointerDown={(e) => handlePendingResizePointerDown(handleDesc.key, e)}
                onPointerMove={handlePendingResizePointerMove}
                onPointerUp={handlePendingResizePointerUp}
                onPointerCancel={handlePendingResizePointerCancel}
                style={{
                  position: "absolute",
                  left: handleDesc.left,
                  top: handleDesc.top,
                  width: REGION_HANDLE_SIZE_PX,
                  height: REGION_HANDLE_SIZE_PX,
                  transform: "translate(-50%, -50%)",
                  cursor: handleDesc.cursor,
                  touchAction: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ ...visualStyle, pointerEvents: "none" }} />
              </div>
            );
            })}
          </div>
          <div
            style={{ position: "absolute", inset: 0, zIndex: 101 }}
            onPointerDown={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              setPendingSelection(null); setAddToNoteOpen(false); setNotesList([]);
              setHoveredNoteId(null); setPreviewPos(null); setSelectedNoteId(null);
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${(pendingSelection.x / naturalSize.width) * 100}%`,
              top: `${Math.min(((pendingSelection.y + pendingSelection.height) / naturalSize.height) * 100, 80)}%`,
              zIndex: 104,
              background: "#fff",
              border: "1px solid #e0dbd3",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              overflow: "hidden",
              minWidth: 160,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              style={{
                display: "block", width: "100%", padding: "10px 16px",
                background: "none", border: "none", textAlign: "left",
                fontSize: 13, cursor: "pointer", color: "#2a2a2a", whiteSpace: "nowrap",
              }}
              onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              onClick={() => {
                const sel = pendingSelection;
                setPendingSelection(null);
                setAddToNoteOpen(false);
                setNotesList([]);
                if (sel) onRegionComplete?.(sel);
              }}
            >
              Create Note
            </button>
            <button
              style={{
                display: "block", width: "100%", padding: "10px 16px",
                background: "none", border: "none", textAlign: "left",
                fontSize: 13, cursor: "pointer", color: "#2a2a2a", whiteSpace: "nowrap",
                borderTop: "1px solid #f0ede8",
              }}
              onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              onClick={async () => {
                if (addToNoteOpen) {
                  setAddToNoteOpen(false); setNotesList([]);
                  setHoveredNoteId(null); setPreviewPos(null); setSelectedNoteId(null);
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  return;
                }
                setAddToNoteOpen(true);
                setNotesLoading(true);
                try {
                  const all = await notesApi.list();
                  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  setNotesList(all);
                } finally {
                  setNotesLoading(false);
                }
              }}
            >
              Add to Note ›
            </button>
            {hoveredNoteId !== null && previewPos && (
              <NoteStrokePreview noteId={hoveredNoteId} x={previewPos.x} y={previewPos.y} />
            )}
            {addToNoteOpen && (
              <div style={{ borderTop: "1px solid #f0ede8", maxHeight: 200, overflowY: "auto" }}>
                {notesLoading ? (
                  <div style={{ padding: "8px 16px", fontSize: 12, color: "#aaa" }}>Loading…</div>
                ) : notesList.length === 0 ? (
                  <div style={{ padding: "8px 16px", fontSize: 12, color: "#aaa" }}>No notes yet</div>
                ) : notesList.map((note) => (
                  <div key={note.id}>
                    <button
                      style={{
                        display: "block", width: "100%", padding: "8px 16px 8px 24px",
                        background: selectedNoteId === note.id ? "#eae8fc" : "none",
                        border: "none", textAlign: "left",
                        fontSize: 13, cursor: "pointer",
                        color: selectedNoteId === note.id ? "#3a4bd6" : "#2a2a2a",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}
                      onPointerEnter={(e) => {
                        if (isTouch) return;
                        (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef";
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        hoverTimerRef.current = setTimeout(() => {
                          const spaceRight = window.innerWidth - rect.right - 8;
                          const px = spaceRight >= 420 ? rect.right + 8 : rect.left - 420 - 8;
                          setHoveredNoteId(note.id);
                          setPreviewPos({ x: px, y: rect.top });
                        }, 150);
                      }}
                      onPointerLeave={(e) => {
                        if (isTouch) return;
                        (e.currentTarget as HTMLButtonElement).style.background =
                          selectedNoteId === note.id ? "#eae8fc" : "none";
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        setHoveredNoteId(null);
                        setPreviewPos(null);
                      }}
                      onClick={(e) => {
                        if (isTouch) {
                          if (selectedNoteId === note.id) {
                            // Second tap — execute
                            setSelectedNoteId(null);
                            setHoveredNoteId(null);
                            setPreviewPos(null);
                            const sel = pendingSelection;
                            setPendingSelection(null);
                            setAddToNoteOpen(false);
                            setNotesList([]);
                            if (sel) onRegionAddToNote?.(sel, note.id);
                          } else {
                            // First tap — select and show floating preview
                            setSelectedNoteId(note.id);
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            const spaceRight = window.innerWidth - rect.right - 8;
                            const px = spaceRight >= 420 ? rect.right + 8 : rect.left - 420 - 8;
                            setHoveredNoteId(note.id);
                            setPreviewPos({ x: px, y: rect.top });
                          }
                          return;
                        }
                        // Mouse: single click executes immediately
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        setHoveredNoteId(null); setPreviewPos(null);
                        const sel = pendingSelection;
                        setPendingSelection(null);
                        setAddToNoteOpen(false);
                        setNotesList([]);
                        if (sel) onRegionAddToNote?.(sel, note.id);
                      }}
                    >
                      {note.name}
                      {isTouch && selectedNoteId === note.id && (
                        <span style={{ fontSize: 11, color: "#7c7ccc", marginLeft: 6 }}>tap again to add</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Region context menu — long-press (touch) or right-click */}
      {regionMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200 }}
            onPointerDown={() => setRegionMenu(null)}
          />
          <div
            style={{
              position: "fixed",
              left: regionMenu.x,
              top: regionMenu.y,
              zIndex: 201,
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
                display: "block", width: "100%", padding: "10px 16px",
                background: "none", border: "none", textAlign: "left",
                fontSize: 13, cursor: "pointer", color: "#2a2a2a", whiteSpace: "nowrap",
              }}
              onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              onClick={() => {
                const menu = regionMenu;
                setRegionMenu(null);
                const region = regions.find(r => r.id === menu.regionId);
                if (region) onRegionClick?.(region);
              }}
            >
              Open Note
            </button>
            {onRegionUpdate && (
              <button
                style={{
                  display: "block", width: "100%", padding: "10px 16px",
                  background: "none", border: "none", textAlign: "left",
                  fontSize: 13, cursor: "pointer", color: "#2a2a2a", whiteSpace: "nowrap",
                }}
                onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
                onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                onClick={() => {
                  const regionId = regionMenu.regionId;
                  setRegionMenu(null);
                  suppressRegionClickRef.current = regionId;
                  setEditingRegionId(regionId);
                }}
              >
                Resize Region
              </button>
            )}
            {onRegionDelete && (
              <button
                style={{
                  display: "block", width: "100%", padding: "10px 16px",
                  background: "none", border: "none", textAlign: "left",
                  fontSize: 13, cursor: "pointer", color: "#c0392b", whiteSpace: "nowrap",
                }}
                onPointerEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fdf0ef"; }}
                onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                onClick={() => {
                  const menu = regionMenu;
                  setRegionMenu(null);
                  const region = regions.find(r => r.id === menu.regionId);
                  if (region) onRegionDelete(region);
                }}
              >
                Delete Note
              </button>
            )}
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
          touchAction: active && mode !== "auto" ? "none" : "auto",
          pointerEvents: (pendingSelection === null && active) ? "all" : "none",
          cursor:
            (effectiveModeRef.current === "pen" || effectiveModeRef.current === "auto")
              ? (activePointerType === "pen" ? "none" : "default")
              : effectiveModeRef.current === "select-region"
              ? "crosshair"
              : effectiveModeRef.current === "stroke-eraser"
              ? "cell"
              : effectiveModeRef.current === "segment-eraser"
              ? "none"
              : "default",
        }}
        {...svgHandlers}
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
                thinning: ds.thinning,
                smoothing: ds.smoothing,
                streamline: ds.streamline,
                simulatePressure: ds.simulatePressure,
                size: s.width,
              });
              d = svgPathFromStroke(outline);
              strokePathCache.current.set(cacheKey, { points: s.points, d });
            }
            return <path key={s.id ?? i} d={d} fill={s.color} data-stroke-id={s.id} />;
          })}
        {erasePreview.size > 0 && [...erasePreview.values()].flat().map((frag, i) => {
          const outline = getStroke(frag.points, {
            thinning: ds.thinning,
            smoothing: ds.smoothing,
            streamline: ds.streamline,
            simulatePressure: ds.simulatePressure,
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
            r={penWidth}
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
