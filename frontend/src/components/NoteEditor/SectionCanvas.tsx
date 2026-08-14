import { useState, useEffect, useCallback, useRef } from "react";
import { DrawingCanvas } from "@/components/Canvas";
import StrokeSelectionOverlay from "@/components/Canvas/StrokeSelectionOverlay";
import type { StrokeData } from "@/components/Canvas";
import { strokes as strokesApi, sections as sectionsApi } from "@/api";
import type { Stroke, NoteUndoEntry, Region, Document } from "@/types";
import type { PenSettings } from "@/components/Toolbar";
import type { ToolMode } from "@/types";
import { normaliseRect, hitTestStrokes, offsetStroke } from "@/components/Canvas/strokeSelectUtils";
import type { NaturalRect } from "@/components/Canvas/strokeSelectUtils";
import { strokesToSvgString, rasterizeSvg, renderStrokesCrop, copyImageToClipboard, newCopyId } from "@/components/Canvas/utils";
import { renderRegionCrop } from "@/components/DocumentViewer/regionCrop";
import RegionPreview from "./RegionPreview";
import styles from "./SectionCanvas.module.css";

const COPY_REGION_WIDTH = 1600;

const MIN_H = 80;
const MIN_SEL_W = 4;
const DUPLICATE_SHIFT = 20;

interface SelectionState {
  rect: NaturalRect;
  selectedIds: Set<number>;
  dragOffset: { dx: number; dy: number } | null;
  drawingAnchor: [number, number] | null;
  drawingCurrent: [number, number] | null;
}

type ClipboardStroke = { points: [number, number, number][]; color: string; width: number };

interface Props {
  sectionId: number;
  initialHeight?: number;
  pen: PenSettings;
  mode?: ToolMode;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onStrokeCommitted?: (stroke: Stroke) => void;
  undoPending?: number | null;
  onUndoConsumed?: () => void;
  redoPending?: Stroke | null;
  onRedoConsumed?: (newStroke: Stroke) => void;
  undoBatchPending?: NoteUndoEntry | null;
  onUndoBatchConsumed?: (newStrokes: Stroke[]) => void;
  redoBatchPending?: NoteUndoEntry | null;
  onRedoBatchConsumed?: (newStrokes: Stroke[]) => void;
  onBatchOperation?: (entry: NoteUndoEntry) => void;
  onCopy?: (sectionId: number, strokes: Stroke[], copyId: string) => void;
  onPasteRequest?: (target?: { nx: number; ny: number }) => void;
  hasClipboard?: boolean;
  pastePending?: { strokes: ClipboardStroke[]; target?: { nx: number; ny: number }; useDuplicateShift?: boolean } | null;
  onPasteConsumed?: (created: Stroke[]) => void;
  onFocused?: () => void;
  onSelectionActive?: () => void;
  onSelectionCleared?: () => void;
  clearSelectionPending?: boolean;
}

function toDisplay(s: Stroke): StrokeData {
  return { id: s.id, points: s.points, color: s.color, width: s.width };
}

export default function SectionCanvas({
  sectionId,
  initialHeight = 320,
  pen,
  mode = "pen",
  onHwOverrideChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onStrokeCommitted,
  undoPending,
  onUndoConsumed,
  redoPending,
  onRedoConsumed,
  undoBatchPending,
  onUndoBatchConsumed,
  redoBatchPending,
  onRedoBatchConsumed,
  onBatchOperation,
  onCopy,
  onPasteRequest,
  hasClipboard,
  pastePending,
  onPasteConsumed,
  onFocused,
  onSelectionActive,
  onSelectionCleared,
  clearSelectionPending,
}: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [regionDims, setRegionDims] = useState<{ width: number; height: number } | false | null>(null);
  const [regionData, setRegionData] = useState<{ region: Region; doc: Document } | null>(null);
  const [height, setHeight] = useState(initialHeight);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = useRef<{ clientX: number; clientY: number; pointerId: number } | null>(null);

  function clearLongPress() {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    longPressPosRef.current = null;
  }

  useEffect(() => {
    strokesApi.listForSection(sectionId).then((data) => {
      setStrokes(data);
      setLoading(false);
    });
  }, [sectionId]);

  // Clear selection when leaving stroke-select mode
  useEffect(() => {
    if (mode !== "stroke-select") setSelection(null);
  }, [mode]);

  // Notify parent when this section transitions into/out of a committed selection
  const wasCommittedRef = useRef(false);
  useEffect(() => {
    const committed = selection !== null && selection.drawingAnchor === null;
    if (committed === wasCommittedRef.current) return;
    wasCommittedRef.current = committed;
    if (committed) onSelectionActive?.();
    else onSelectionCleared?.();
  }, [selection, onSelectionActive, onSelectionCleared]);

  // Clear our selection when another section has taken ownership
  useEffect(() => {
    if (clearSelectionPending) setSelection(null);
  }, [clearSelectionPending]);

  const naturalWidth = regionDims ? regionDims.width : (containerRef.current?.clientWidth ?? 800);
  const naturalHeight = regionDims ? regionDims.height : height;

  const handleStrokeSelectStart = useCallback((pt: [number, number]) => {
    setSelection({ rect: { x: pt[0], y: pt[1], width: 0, height: 0 }, selectedIds: new Set(), dragOffset: null, drawingAnchor: pt, drawingCurrent: pt });
  }, []);

  const handleStrokeSelectMove = useCallback((pt: [number, number]) => {
    setSelection(prev => {
      if (!prev?.drawingAnchor) return prev;
      return { ...prev, drawingCurrent: pt };
    });
  }, []);

  const handleStrokeSelectEnd = useCallback(() => {
    setSelection(prev => {
      if (!prev?.drawingAnchor || !prev.drawingCurrent) return null;
      const rect = normaliseRect(prev.drawingAnchor[0], prev.drawingAnchor[1], prev.drawingCurrent[0], prev.drawingCurrent[1]);
      if (rect.width < MIN_SEL_W || rect.height < MIN_SEL_W) return null;
      const selectedIds = hitTestStrokes(strokes.map(toDisplay), rect);
      return { rect, selectedIds, dragOffset: null, drawingAnchor: null, drawingCurrent: null };
    });
  }, [strokes]);

  const handleRectChange = useCallback((newRect: NaturalRect) => {
    setSelection(prev => {
      if (!prev) return null;
      const selectedIds = hitTestStrokes(strokes.map(toDisplay), newRect);
      return { ...prev, rect: newRect, selectedIds, dragOffset: null, drawingAnchor: null, drawingCurrent: null };
    });
  }, [strokes]);

  const handleMoveChange = useCallback((dx: number, dy: number) => {
    setSelection(prev => prev ? { ...prev, dragOffset: { dx, dy } } : null);
  }, []);

  const handleMoveComplete = useCallback(async (dx: number, dy: number) => {
    if (!selection || selection.selectedIds.size === 0) {
      setSelection(prev => prev ? { ...prev, dragOffset: null } : null);
      return;
    }
    const toMove = strokes.filter(s => selection.selectedIds.has(s.id));
    if (toMove.length === 0) {
      setSelection(prev => prev ? { ...prev, dragOffset: null } : null);
      return;
    }
    const newPoints = toMove.map(s => offsetStroke(s, dx, dy));
    // Optimistic: update local state immediately
    setStrokes(prev => {
      const ids = new Set(toMove.map(s => s.id));
      const remaining = prev.filter(s => !ids.has(s.id));
      const tempCreated: Stroke[] = newPoints.map((s, i) => ({ ...s, id: -(Date.now() + i) }));
      return [...remaining, ...tempCreated];
    });
    setSelection(prev => prev ? {
      ...prev,
      rect: { ...prev.rect, x: prev.rect.x + dx, y: prev.rect.y + dy },
      dragOffset: null,
    } : null);

    // Commit: delete originals + recreate moved
    await Promise.all(toMove.map(s => strokesApi.delete(s.id)));
    const created = await strokesApi.createBatch(newPoints.map(s => ({
      section_id: sectionId, document_id: null, page_number: null,
      points: s.points, color: s.color, width: s.width,
    })));
    setStrokes(prev => {
      const tempIds = new Set(prev.filter(s => s.id < 0).map(s => s.id));
      const withoutTemp = prev.filter(s => !tempIds.has(s.id));
      return [...withoutTemp, ...created];
    });
    setSelection(prev => prev ? { ...prev, selectedIds: new Set(created.map(s => s.id)) } : null);
    onBatchOperation?.({ kind: "batch-move", sectionId, deleted: toMove, created });
  }, [selection, strokes, sectionId, onBatchOperation]);

  const handleDelete = useCallback(async () => {
    if (!selection || selection.selectedIds.size === 0) { setSelection(null); return; }
    const toDelete = strokes.filter(s => selection.selectedIds.has(s.id));
    setStrokes(prev => prev.filter(s => !selection.selectedIds.has(s.id)));
    setSelection(null);
    await Promise.all(toDelete.map(s => strokesApi.delete(s.id)));
    onBatchOperation?.({ kind: "batch-delete", sectionId, strokes: toDelete });
  }, [selection, strokes, sectionId, onBatchOperation]);

  const handleDuplicate = useCallback(async () => {
    if (!selection || selection.selectedIds.size === 0) return;
    const toDup = strokes.filter(s => selection.selectedIds.has(s.id));
    if (toDup.length === 0) return;
    const shifted = toDup.map(s => offsetStroke(s, DUPLICATE_SHIFT, DUPLICATE_SHIFT));
    const tempStrokes: typeof strokes = shifted.map((s, i) => ({ ...s, id: -(Date.now() + i) }));
    setStrokes(prev => [...prev, ...tempStrokes]);
    setSelection(prev => prev ? {
      ...prev,
      rect: { ...prev.rect, x: prev.rect.x + DUPLICATE_SHIFT, y: prev.rect.y + DUPLICATE_SHIFT },
      selectedIds: new Set(tempStrokes.map(s => s.id)),
    } : null);
    const created = await strokesApi.createBatch(shifted.map(s => ({
      section_id: sectionId, document_id: null, page_number: null,
      points: s.points, color: s.color, width: s.width,
    })));
    const tempIds = new Set(tempStrokes.map(s => s.id));
    setStrokes(prev => [...prev.filter(s => !tempIds.has(s.id)), ...created]);
    setSelection(prev => prev ? { ...prev, selectedIds: new Set(created.map(s => s.id)) } : null);
    onBatchOperation?.({ kind: "batch-duplicate", sectionId, created });
  }, [selection, strokes, sectionId, onBatchOperation]);

  const handleCopy = useCallback(() => {
    if (!selection || selection.selectedIds.size === 0) return;
    const toCopy = strokes.filter(s => selection.selectedIds.has(s.id));
    if (toCopy.length === 0) return;
    const copyId = newCopyId();
    onCopy?.(sectionId, toCopy, copyId);
    // Also put a PNG of the selection on the OS clipboard so it can be pasted into other apps. The
    // in-app copy above is the primary path and stays authoritative for pasting within the note —
    // this is best-effort and deliberately swallows failures (no clipboard API on plain-HTTP
    // origins, permission denied, …). Tagged with `copyId` so a future OS-clipboard paste can
    // recognise its own copy and paste vector strokes rather than re-importing this image.
    void copyImageToClipboard(() => renderStrokesCrop(toCopy), { copyId }).catch(() => {});
  }, [selection, strokes, sectionId, onCopy]);

  // Whole-section copy. No `copyId`: this does not populate the in-app stroke clipboard, so it must
  // not claim to be one of our stroke copies.
  const handleCopyImage = useCallback(() => {
    if (regionData) {
      const { region, doc } = regionData;
      return copyImageToClipboard(async () => {
        const out = await renderRegionCrop(region, doc, COPY_REGION_WIDTH);
        const svg = strokesToSvgString(strokes, { width: out.width, height: out.height, viewBox: `0 0 ${region.width} ${region.height}`, transparentBg: true });
        const strokesCanvas = await rasterizeSvg(svg, out.width, out.height);
        out.getContext("2d")!.drawImage(strokesCanvas, 0, 0);
        return out;
      });
    }
    if (strokes.length === 0) return Promise.resolve();
    return copyImageToClipboard(() => renderStrokesCrop(strokes));
  }, [regionData, strokes]);

  const canCopyImage = regionData !== null || strokes.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const hasCommitted = selection !== null && selection.drawingAnchor === null && selection.selectedIds.size > 0;
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (hasCommitted) { e.preventDefault(); handleCopy(); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (hasCommitted) { e.preventDefault(); void handleDelete(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selection, handleCopy, handleDelete]);

  const handleStrokeComplete = useCallback(
    async (stroke: StrokeData) => {
      const tempId = -Date.now();
      const optimistic: Stroke = {
        id: tempId,
        section_id: sectionId,
        document_id: null,
        page_number: null,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
        created_at: new Date().toISOString(),
      };
      setStrokes((prev) => [...prev, optimistic]);

      const saved = await strokesApi.create({
        section_id: sectionId,
        document_id: null,
        page_number: null,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
      });
      setStrokes((prev) => prev.map((s) => (s.id === tempId ? saved : s)));
      onStrokeCommitted?.(saved);
    },
    [sectionId, onStrokeCommitted]
  );

  const handleEraseStroke = useCallback((id: number) => {
    setStrokes((prev) => {
      if (!prev.find((s) => s.id === id)) return prev;
      strokesApi.delete(id);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const handleSegmentErase = useCallback((deleted: number[], created: StrokeData[]) => {
    const tempIds = created.map((_, i) => -(Date.now() + i));
    setStrokes(prev => {
      const remaining = prev.filter(s => !deleted.includes(s.id));
      const optimistic: Stroke[] = created.map((s, i) => ({
        id: tempIds[i], section_id: sectionId, document_id: null, page_number: null,
        points: s.points, color: s.color, width: s.width,
        created_at: new Date().toISOString(),
      }));
      return [...remaining, ...optimistic];
    });
    deleted.forEach(id => strokesApi.delete(id));
    if (created.length > 0) {
      void strokesApi.createBatch(created.map(s => ({
        section_id: sectionId, document_id: null, page_number: null,
        points: s.points, color: s.color, width: s.width,
      }))).then(saved => {
        setStrokes(prev => {
          const without = prev.filter(s => !tempIds.includes(s.id));
          return [...without, ...saved];
        });
      });
    }
  }, [sectionId]);

  // Single-stroke undo
  useEffect(() => {
    if (undoPending == null) return;
    setStrokes((prev) => prev.filter((s) => s.id !== undoPending));
    void strokesApi.delete(undoPending);
    onUndoConsumed?.();
  }, [undoPending, onUndoConsumed]);

  // Single-stroke redo
  useEffect(() => {
    if (redoPending == null) return;
    void strokesApi.create({
      section_id: sectionId,
      document_id: null,
      page_number: null,
      points: redoPending.points,
      color: redoPending.color,
      width: redoPending.width,
    }).then((saved) => {
      setStrokes((prev) => [...prev, saved]);
      onRedoConsumed?.(saved);
    });
  }, [redoPending, sectionId, onRedoConsumed]);

  // Batch undo: batch-delete → recreate; batch-move → delete created + recreate deleted
  useEffect(() => {
    const entry = undoBatchPending;
    if (entry == null || !("kind" in entry)) return;
    if (entry.kind === "batch-delete") {
      void strokesApi.createBatch(entry.strokes.map(s => ({
        section_id: sectionId, document_id: null, page_number: null,
        points: s.points, color: s.color, width: s.width,
      }))).then(saved => {
        setStrokes(prev => [...prev, ...saved]);
        onUndoBatchConsumed?.(saved);
      });
    } else if (entry.kind === "batch-move") {
      void Promise.all(entry.created.map(s => strokesApi.delete(s.id))).then(async () => {
        const saved = await strokesApi.createBatch(entry.deleted.map(s => ({
          section_id: sectionId, document_id: null, page_number: null,
          points: s.points, color: s.color, width: s.width,
        })));
        setStrokes(prev => {
          const ids = new Set(entry.created.map(s => s.id));
          return [...prev.filter(s => !ids.has(s.id)), ...saved];
        });
        onUndoBatchConsumed?.(saved);
      });
    } else if (entry.kind === "batch-duplicate") {
      const ids = new Set(entry.created.map(s => s.id));
      setStrokes(prev => prev.filter(s => !ids.has(s.id)));
      void Promise.all(entry.created.map(s => strokesApi.delete(s.id))).then(() => {
        onUndoBatchConsumed?.([]);
      });
    } else if (entry.kind === "batch-paste") {
      const ids = new Set(entry.created.map(s => s.id));
      setStrokes(prev => prev.filter(s => !ids.has(s.id)));
      void Promise.all(entry.created.map(s => strokesApi.delete(s.id))).then(() => {
        onUndoBatchConsumed?.([]);
      });
    }
  }, [undoBatchPending, sectionId, onUndoBatchConsumed]);

  // Batch redo: batch-delete → delete; batch-move → delete recreated originals + recreate moved
  useEffect(() => {
    const entry = redoBatchPending;
    if (entry == null || !("kind" in entry)) return;
    if (entry.kind === "batch-delete") {
      const ids = new Set(entry.strokes.map(s => s.id));
      setStrokes(prev => prev.filter(s => !ids.has(s.id)));
      void Promise.all(entry.strokes.map(s => strokesApi.delete(s.id))).then(() => {
        onRedoBatchConsumed?.([]);
      });
    } else if (entry.kind === "batch-move") {
      void Promise.all(entry.deleted.map(s => strokesApi.delete(s.id))).then(async () => {
        const saved = await strokesApi.createBatch(entry.created.map(s => ({
          section_id: sectionId, document_id: null, page_number: null,
          points: s.points, color: s.color, width: s.width,
        })));
        setStrokes(prev => {
          const ids = new Set(entry.deleted.map(s => s.id));
          return [...prev.filter(s => !ids.has(s.id)), ...saved];
        });
        onRedoBatchConsumed?.(saved);
      });
    } else if (entry.kind === "batch-duplicate") {
      void strokesApi.createBatch(entry.created.map(s => ({
        section_id: sectionId, document_id: null, page_number: null,
        points: s.points, color: s.color, width: s.width,
      }))).then(saved => {
        setStrokes(prev => [...prev, ...saved]);
        onRedoBatchConsumed?.(saved);
      });
    } else if (entry.kind === "batch-paste") {
      void strokesApi.createBatch(entry.created.map(s => ({
        section_id: sectionId, document_id: null, page_number: null,
        points: s.points, color: s.color, width: s.width,
      }))).then(saved => {
        setStrokes(prev => [...prev, ...saved]);
        onRedoBatchConsumed?.(saved);
      });
    }
  }, [redoBatchPending, sectionId, onRedoBatchConsumed]);

  // Paste: optimistically add strokes, activate selection so user can move immediately
  useEffect(() => {
    if (!pastePending || pastePending.strokes.length === 0) return;
    const { strokes: clipStrokes, target } = pastePending;
    const allPts = clipStrokes.flatMap(s => s.points);
    const minX = Math.min(...allPts.map(([x]) => x));
    const maxX = Math.max(...allPts.map(([x]) => x));
    const minY = Math.min(...allPts.map(([, y]) => y));
    const maxY = Math.max(...allPts.map(([, y]) => y));
    const dx = pastePending.useDuplicateShift ? DUPLICATE_SHIFT : (target ? target.nx - minX : 0);
    const dy = pastePending.useDuplicateShift ? DUPLICATE_SHIFT : (target ? target.ny - minY : 0);
    const shiftedStrokes = clipStrokes.map(s => ({
      ...s,
      points: s.points.map(([x, y, p]) => [x + dx, y + dy, p] as [number, number, number]),
    }));
    const tempStrokes: Stroke[] = shiftedStrokes.map((s, i) => ({
      id: -(Date.now() + i),
      section_id: sectionId, document_id: null, page_number: null,
      points: s.points, color: s.color, width: s.width,
      created_at: new Date().toISOString(),
    }));
    const rect: NaturalRect = { x: minX + dx, y: minY + dy, width: maxX - minX, height: maxY - minY };
    setStrokes(prev => [...prev, ...tempStrokes]);
    setSelection({ rect, selectedIds: new Set(tempStrokes.map(s => s.id)), dragOffset: null, drawingAnchor: null, drawingCurrent: null });
    void strokesApi.createBatch(shiftedStrokes.map(s => ({
      section_id: sectionId, document_id: null, page_number: null,
      points: s.points, color: s.color, width: s.width,
    }))).then(created => {
      const tempIds = new Set(tempStrokes.map(s => s.id));
      setStrokes(prev => [...prev.filter(s => !tempIds.has(s.id)), ...created]);
      setSelection(prev => prev ? { ...prev, selectedIds: new Set(created.map(s => s.id)) } : null);
      onPasteConsumed?.(created);
    });
  }, [pastePending, sectionId, onPasteConsumed]);

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = height;
    function onMove(ev: PointerEvent) {
      setHeight(Math.max(MIN_H, startH + ev.clientY - startY));
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const final = Math.max(MIN_H, startH + ev.clientY - startY);
      void sectionsApi.update(sectionId, { height: final });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sectionId, height]);

  const drawingRect = selection?.drawingAnchor && selection.drawingCurrent
    ? normaliseRect(selection.drawingAnchor[0], selection.drawingAnchor[1], selection.drawingCurrent[0], selection.drawingCurrent[1])
    : null;

  const hasCommittedSelection = selection !== null && selection.drawingAnchor === null;

  return (
    <div
      ref={containerRef}
      data-section-id={sectionId}
      style={{
        position: "relative",
        background: "var(--bg-card)",
        borderRadius: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        marginBottom: 2,
        outline: "none",
        minHeight: collapsed ? 40 : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={mode === "stroke-select" ? (e) => { e.preventDefault(); setCanvasMenu({ x: e.clientX, y: e.clientY }); } : undefined}
      onPointerDownCapture={(e) => {
        onFocused?.();
        if (mode !== "stroke-select" || e.button !== 0 || (e.pointerType !== "touch" && e.pointerType !== "pen")) return;
        if (hasCommittedSelection) return;
        const { clientX, clientY, pointerId } = e;
        longPressPosRef.current = { clientX, clientY, pointerId };
        longPressTimerRef.current = setTimeout(() => {
          const pos = longPressPosRef.current;
          longPressTimerRef.current = null;
          longPressPosRef.current = null;
          if (pos) { handleStrokeSelectEnd(); setCanvasMenu({ x: pos.clientX, y: pos.clientY }); }
        }, 450);
      }}
      onPointerMoveCapture={(e) => {
        const pos = longPressPosRef.current;
        if (!pos || e.pointerId !== pos.pointerId) return;
        if ((e.clientX - pos.clientX) ** 2 + (e.clientY - pos.clientY) ** 2 > 64) clearLongPress();
      }}
      onPointerUpCapture={(e) => { if (longPressPosRef.current?.pointerId === e.pointerId) clearLongPress(); }}
      onPointerCancelCapture={(e) => { if (longPressPosRef.current?.pointerId === e.pointerId) clearLongPress(); }}
    >
      <button
        className={styles.collapseBtn}
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand section" : "Collapse section"}
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
      >
        {collapsed ? "▼" : "▲"}
      </button>
      <button
        className={styles.moveUpBtn}
        onClick={onMoveUp}
        disabled={!onMoveUp}
        title="Move section up"
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
      >
        ↑
      </button>
      <button
        className={styles.moveDownBtn}
        onClick={onMoveDown}
        disabled={!onMoveDown}
        title="Move section down"
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
      >
        ↓
      </button>
      <button
        className={styles.copyImageBtn}
        onClick={() => { void handleCopyImage(); }}
        disabled={!canCopyImage}
        title="Copy section as image"
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
      >
        ⧉
      </button>
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        title="Delete section"
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
      >
        ×
      </button>

      <div style={{ display: collapsed ? "none" : undefined }}>
        <RegionPreview
          sectionId={sectionId}
          onRegionLoaded={(dims, region, doc) => {
            setRegionDims(dims ?? false);
            setRegionData(dims && region && doc ? { region, doc } : null);
          }}
        />
      </div>

      {!collapsed && (
        <>
          {regionDims !== null && regionDims !== false && !loading && (
            <>
              <DrawingCanvas
                strokes={strokes.map(toDisplay)}
                onStrokeComplete={handleStrokeComplete}
                onEraseStroke={handleEraseStroke}
                onSegmentErase={handleSegmentErase}
                onStrokeSelectStart={handleStrokeSelectStart}
                onStrokeSelectMove={handleStrokeSelectMove}
                onStrokeSelectEnd={handleStrokeSelectEnd}
                inputEnabled={mode !== "hand"}
                mode={mode}
                onHwOverrideChange={onHwOverrideChange}
                color={pen.color}
                penWidth={pen.width}
                viewBox={`0 0 ${regionDims.width} ${regionDims.height}`}
                style={{ position: "absolute", inset: 0, height: "auto" }}
                selectionDragRect={drawingRect}
                selectedStrokeIds={hasCommittedSelection ? selection!.selectedIds : null}
                strokeMoveOffset={hasCommittedSelection ? selection!.dragOffset : null}
              />
              {hasCommittedSelection && (
                <StrokeSelectionOverlay
                  rect={selection!.rect}
                  naturalWidth={regionDims.width}
                  naturalHeight={regionDims.height}
                  containerRef={containerRef as React.RefObject<HTMLElement>}
                  onRectChange={handleRectChange}
                  onMoveChange={handleMoveChange}
                  onMoveComplete={handleMoveComplete}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onCopy={handleCopy}
                  onPasteRequest={onPasteRequest}
                  hasClipboard={hasClipboard}
                />
              )}
            </>
          )}
          {regionDims === false && (
            <>
              {loading ? (
                <div style={{ height }} />
              ) : (
                <div ref={canvasWrapperRef} style={{ position: "relative" }}>
                  <DrawingCanvas
                    strokes={strokes.map(toDisplay)}
                    onStrokeComplete={handleStrokeComplete}
                    onEraseStroke={handleEraseStroke}
                    onSegmentErase={handleSegmentErase}
                    onStrokeSelectStart={handleStrokeSelectStart}
                    onStrokeSelectMove={handleStrokeSelectMove}
                    onStrokeSelectEnd={handleStrokeSelectEnd}
                    inputEnabled={mode !== "hand"}
                    mode={mode}
                    onHwOverrideChange={onHwOverrideChange}
                    color={pen.color}
                    penWidth={pen.width}
                    height={height}
                    selectionDragRect={drawingRect}
                    selectedStrokeIds={hasCommittedSelection ? selection!.selectedIds : null}
                    strokeMoveOffset={hasCommittedSelection ? selection!.dragOffset : null}
                  />
                  {hasCommittedSelection && (
                    <StrokeSelectionOverlay
                      rect={selection!.rect}
                      naturalWidth={naturalWidth}
                      naturalHeight={naturalHeight}
                      containerRef={canvasWrapperRef as React.RefObject<HTMLElement>}
                      onRectChange={handleRectChange}
                      onMoveChange={handleMoveChange}
                      onMoveComplete={handleMoveComplete}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onCopy={handleCopy}
                      onPasteRequest={onPasteRequest}
                      hasClipboard={hasClipboard}
                    />
                  )}
                </div>
              )}
              <div
                onPointerDown={onResizeStart}
                style={{
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "ns-resize",
                  touchAction: "none",
                  userSelect: "none",
                }}
              >
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--resize-handle)" }} />
              </div>
            </>
          )}
        </>
      )}

      {canvasMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200 }}
            onPointerDown={() => setCanvasMenu(null)}
          />
          <div
            style={{
              position: "fixed",
              left: canvasMenu.x,
              top: canvasMenu.y,
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
              disabled={!hasClipboard}
              style={{
                display: "block", width: "100%", padding: "10px 16px",
                background: "none", border: "none", textAlign: "left",
                fontSize: 13, cursor: hasClipboard ? "pointer" : "default",
                color: hasClipboard ? "#2a2a2a" : "#aaa", whiteSpace: "nowrap",
              }}
              onPointerEnter={(e) => { if (hasClipboard) (e.currentTarget as HTMLButtonElement).style.background = "#f5f3ef"; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              onClick={() => {
                if (!hasClipboard || !canvasMenu) return;
                const el = (regionDims !== null && regionDims !== false) ? containerRef.current : canvasWrapperRef.current;
                let target: { nx: number; ny: number } | undefined;
                if (el) {
                  const bounds = el.getBoundingClientRect();
                  const nw = (regionDims !== null && regionDims !== false) ? regionDims.width : naturalWidth;
                  const nh = (regionDims !== null && regionDims !== false) ? regionDims.height : naturalHeight;
                  target = {
                    nx: (canvasMenu.x - bounds.left) * (nw / bounds.width),
                    ny: (canvasMenu.y - bounds.top) * (nh / bounds.height),
                  };
                }
                setCanvasMenu(null);
                onPasteRequest?.(target);
              }}
            >
              Paste
            </button>
          </div>
        </>
      )}
    </div>
  );
}
