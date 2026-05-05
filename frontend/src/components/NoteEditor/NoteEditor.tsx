import { useState, useEffect, useCallback, useRef } from "react";
import { sections as sectionsApi } from "@/api";
import type { Section, ToolMode, Stroke } from "@/types";
import SectionCanvas from "./SectionCanvas";
import { Toolbar, DEFAULT_PEN } from "@/components/Toolbar";
import type { PenSettings } from "@/components/Toolbar";
import { UndoRedoBar } from "@/components/UndoRedoBar";

interface Props {
  noteId: number;
}

export default function NoteEditor({ noteId }: Props) {
  const [sectionList, setSectionList] = useState<Section[]>([]);
  const [adding, setAdding] = useState(false);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [tool, setTool] = useState<ToolMode>("auto");
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);
  const [undoStack, setUndoStack] = useState<Array<{ sectionId: number; stroke: Stroke }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ sectionId: number; stroke: Stroke }>>([]);
  const [undoPending, setUndoPending] = useState<{ sectionId: number; strokeId: number } | null>(null);
  const [redoPending, setRedoPending] = useState<{ sectionId: number; stroke: Stroke } | null>(null);
  const pendingUndoEntryRef = useRef<{ sectionId: number; stroke: Stroke } | null>(null);
  const pendingRedoSectionIdRef = useRef<number | null>(null);

  useEffect(() => {
    sectionsApi.list(noteId).then(setSectionList);
  }, [noteId]);

  const handleStrokeCommitted = useCallback((sectionId: number, stroke: Stroke) => {
    setUndoStack((prev) => [...prev, { sectionId, stroke }]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    pendingUndoEntryRef.current = last;
    setUndoStack((prev) => prev.slice(0, -1));
    setUndoPending({ sectionId: last.sectionId, strokeId: last.stroke.id });
  }, [undoStack]);

  const handleUndoConsumed = useCallback(() => {
    const entry = pendingUndoEntryRef.current;
    pendingUndoEntryRef.current = null;
    setUndoPending(null);
    if (entry) setRedoStack((prev) => [...prev, entry]);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    pendingRedoSectionIdRef.current = last.sectionId;
    setRedoStack((prev) => prev.slice(0, -1));
    setRedoPending({ sectionId: last.sectionId, stroke: last.stroke });
  }, [redoStack]);

  const handleRedoConsumed = useCallback((newStroke: Stroke) => {
    const sectionId = pendingRedoSectionIdRef.current;
    pendingRedoSectionIdRef.current = null;
    setRedoPending(null);
    if (sectionId != null) setUndoStack((prev) => [...prev, { sectionId, stroke: newStroke }]);
  }, []);

  const addSection = async () => {
    setAdding(true);
    const section = await sectionsApi.create(noteId, sectionList.length);
    setSectionList((prev) => [...prev, section]);
    setAdding(false);
  };

  const deleteSection = async (id: number) => {
    await sectionsApi.delete(id);
    setSectionList((prev) => prev.filter((s) => s.id !== id));
    setUndoStack((prev) => prev.filter((e) => e.sectionId !== id));
    setRedoStack((prev) => prev.filter((e) => e.sectionId !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Toolbar
          settings={pen}
          onChange={setPen}
          tool={tool}
          onToolChange={setTool}
          availableTools={["auto", "hand", "pen", "stroke-eraser", "segment-eraser"]}
          activeOverride={hwOverride}
        />
        <div style={{ width: 1, height: 18, background: "#dedad3", flexShrink: 0 }} />
        <UndoRedoBar
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>

      {sectionList.length === 0 && (
        <div
          style={{
            height: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#aaa",
            fontSize: 14,
            background: "#fff",
            borderRadius: 4,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          No sections yet — add one below
        </div>
      )}

      {sectionList.map((section) => (
        <SectionCanvas
          key={section.id}
          sectionId={section.id}
          initialHeight={section.height}
          pen={pen}
          inputEnabled={tool !== "hand"}
          eraserMode={tool === "stroke-eraser"}
          segmentEraserMode={tool === "segment-eraser"}
          onHwOverrideChange={setHwOverride}
          onDelete={() => deleteSection(section.id)}
          onStrokeCommitted={(stroke) => handleStrokeCommitted(section.id, stroke)}
          undoPending={undoPending?.sectionId === section.id ? undoPending.strokeId : null}
          onUndoConsumed={handleUndoConsumed}
          redoPending={redoPending?.sectionId === section.id ? redoPending.stroke : null}
          onRedoConsumed={handleRedoConsumed}
        />
      ))}

      <button
        onClick={addSection}
        disabled={adding}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          borderRadius: 4,
          border: "1px dashed #ccc",
          background: "transparent",
          cursor: "pointer",
          fontSize: 13,
          color: "#666",
          alignSelf: "flex-start",
        }}
      >
        {adding ? "Adding…" : "+ Add section"}
      </button>
    </div>
  );
}
