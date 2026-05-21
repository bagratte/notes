import { useState, useEffect, useCallback } from "react";
import { DrawingCanvas } from "@/components/Canvas";
import type { StrokeData } from "@/components/Canvas";
import { strokes as strokesApi, sections as sectionsApi } from "@/api";
import type { Stroke } from "@/types";
import type { PenSettings } from "@/components/Toolbar";
import type { ToolMode } from "@/types";
import RegionPreview from "./RegionPreview";

const MIN_H = 80;
const MAX_H = 3000;

interface Props {
  sectionId: number;
  initialHeight?: number;
  pen: PenSettings;
  mode?: ToolMode;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  onDelete: () => void;
  onStrokeCommitted?: (stroke: Stroke) => void;
  undoPending?: number | null;
  onUndoConsumed?: () => void;
  redoPending?: Stroke | null;
  onRedoConsumed?: (newStroke: Stroke) => void;
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
  onStrokeCommitted,
  undoPending,
  onUndoConsumed,
  redoPending,
  onRedoConsumed,
}: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [hasRegion, setHasRegion] = useState<boolean | null>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    strokesApi.listForSection(sectionId).then((data) => {
      setStrokes(data);
      setLoading(false);
    });
  }, [sectionId]);

  // Add stroke optimistically so it stays visible immediately; replace with
  // server-confirmed version (which has the real id) after the save completes.
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

  useEffect(() => {
    if (undoPending == null) return;
    setStrokes((prev) => prev.filter((s) => s.id !== undoPending));
    void strokesApi.delete(undoPending);
    onUndoConsumed?.();
  }, [undoPending, onUndoConsumed]);

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

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = height;
    function onMove(ev: PointerEvent) {
      setHeight(Math.max(MIN_H, Math.min(MAX_H, startH + ev.clientY - startY)));
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const final = Math.max(MIN_H, Math.min(MAX_H, startH + ev.clientY - startY));
      void sectionsApi.update(sectionId, { height: final });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sectionId, height]);

  return (
    <div
      data-section-id={sectionId}
      style={{
        position: "relative",
        background: "var(--bg-card)",
        borderRadius: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        marginBottom: 2,
        outline: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <RegionPreview sectionId={sectionId} onHasRegion={setHasRegion} />
      {hasRegion === false && (
        <>
          {loading ? (
            <div style={{ height }} />
          ) : (
            <DrawingCanvas
              strokes={strokes.map(toDisplay)}
              onStrokeComplete={handleStrokeComplete}
              onEraseStroke={handleEraseStroke}
              onSegmentErase={handleSegmentErase}
              inputEnabled={mode !== "hand"}
              mode={mode}
              onHwOverrideChange={onHwOverrideChange}
              color={pen.color}
              penWidth={pen.width}
              height={height}
            />
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
      <button
        onClick={onDelete}
        title="Delete section"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hovered ? "auto" : "none",
          color: "var(--text-muted)",
        }}
      >
        ×
      </button>
    </div>
  );
}
