import { useState, useEffect, useCallback } from "react";
import { DrawingCanvas } from "@/components/Canvas";
import type { StrokeData } from "@/components/Canvas";
import { strokes as strokesApi } from "@/api";
import type { Stroke } from "@/types";
import type { PenSettings } from "@/components/PenToolbar";
import RegionPreview from "./RegionPreview";

interface Props {
  sectionId: number;
  pen: PenSettings;
  inputEnabled?: boolean;
  eraserMode?: boolean;
  onDelete: () => void;
}

function toDisplay(s: Stroke): StrokeData {
  return { id: s.id, points: s.points, color: s.color, width: s.width };
}

export default function SectionCanvas({
  sectionId,
  pen,
  inputEnabled = true,
  eraserMode = false,
  onDelete,
}: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [_redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [hasRegion, setHasRegion] = useState<boolean | null>(null);

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
      setRedoStack([]);

      const saved = await strokesApi.create({
        section_id: sectionId,
        document_id: null,
        page_number: null,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
      });
      setStrokes((prev) => prev.map((s) => (s.id === tempId ? saved : s)));
    },
    [sectionId]
  );

  const handleEraseStroke = useCallback((id: number) => {
    setStrokes((prev) => {
      if (!prev.find((s) => s.id === id)) return prev;
      strokesApi.delete(id);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.id < 0) return prev; // in-flight optimistic stroke — skip
      setRedoStack((r) => [...r, last]);
      strokesApi.delete(last.id);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      strokesApi
        .create({
          section_id: sectionId,
          document_id: null,
          page_number: null,
          points: last.points,
          color: last.color,
          width: last.width,
        })
        .then((saved) => setStrokes((s) => [...s, saved]));
      return prev.slice(0, -1);
    });
  }, [sectionId]);

  // Keyboard shortcuts when this section is hovered
  useEffect(() => {
    if (!hovered) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hovered, undo, redo]);

  return (
    <div
      data-section-id={sectionId}
      style={{
        position: "relative",
        background: "#fff",
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
        loading ? (
          <div style={{ height: 320 }} />
        ) : (
          <DrawingCanvas
            strokes={strokes.map(toDisplay)}
            onStrokeComplete={handleStrokeComplete}
            onEraseStroke={handleEraseStroke}
            inputEnabled={inputEnabled}
            eraserMode={eraserMode}
            color={pen.color}
            penWidth={pen.width}
            height={320}
          />
        )
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
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        ×
      </button>
    </div>
  );
}
