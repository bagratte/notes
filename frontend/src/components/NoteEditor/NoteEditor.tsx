import { useState, useEffect, useCallback, useRef } from "react";
import { sections as sectionsApi } from "@/api";
import type { Section, ToolMode, Stroke, NoteUndoEntry } from "@/types";
import SectionCanvas from "./SectionCanvas";
import { Toolbar, DEFAULT_PEN } from "@/components/Toolbar";
import type { PenSettings } from "@/components/Toolbar";
import { UndoRedoBar } from "@/components/UndoRedoBar";

interface Props {
  noteId: number;
}

function isSingleEntry(e: NoteUndoEntry): e is { sectionId: number; stroke: Stroke } {
  return !("kind" in e);
}

export default function NoteEditor({ noteId }: Props) {
  const [sectionList, setSectionList] = useState<Section[]>([]);
  const [adding, setAdding] = useState(false);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [tool, setTool] = useState<ToolMode>("auto");
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);
  const [undoStack, setUndoStack] = useState<NoteUndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<NoteUndoEntry[]>([]);
  const [undoPending, setUndoPending] = useState<{ sectionId: number; strokeId: number } | null>(null);
  const [redoPending, setRedoPending] = useState<{ sectionId: number; stroke: Stroke } | null>(null);
  const [undoBatchPending, setUndoBatchPending] = useState<NoteUndoEntry | null>(null);
  const [redoBatchPending, setRedoBatchPending] = useState<NoteUndoEntry | null>(null);
  const pendingUndoEntryRef = useRef<NoteUndoEntry | null>(null);
  const pendingRedoSectionIdRef = useRef<number | null>(null);
  const pendingUndoBatchRef = useRef<NoteUndoEntry | null>(null);
  const pendingRedoBatchRef = useRef<NoteUndoEntry | null>(null);

  useEffect(() => {
    sectionsApi.list(noteId).then(setSectionList);
  }, [noteId]);

  const handleStrokeCommitted = useCallback((sectionId: number, stroke: Stroke) => {
    setUndoStack((prev) => [...prev, { sectionId, stroke }]);
    setRedoStack([]);
  }, []);

  const handleBatchOperation = useCallback((entry: NoteUndoEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    if (isSingleEntry(last)) {
      pendingUndoEntryRef.current = last;
      setUndoPending({ sectionId: last.sectionId, strokeId: last.stroke.id });
    } else {
      pendingUndoBatchRef.current = last;
      setUndoBatchPending(last);
    }
  }, [undoStack]);

  const handleUndoConsumed = useCallback(() => {
    const entry = pendingUndoEntryRef.current;
    pendingUndoEntryRef.current = null;
    setUndoPending(null);
    if (entry) setRedoStack((prev) => [...prev, entry]);
  }, []);

  const handleUndoBatchConsumed = useCallback((newStrokes: Stroke[]) => {
    const entry = pendingUndoBatchRef.current;
    pendingUndoBatchRef.current = null;
    setUndoBatchPending(null);
    if (!entry || !("kind" in entry)) return;
    // Build inverse entry for redo stack
    if (entry.kind === "batch-delete") {
      setRedoStack((prev) => [...prev, { kind: "batch-delete", sectionId: entry.sectionId, strokes: newStrokes }]);
    } else if (entry.kind === "batch-move") {
      setRedoStack((prev) => [...prev, { kind: "batch-move", sectionId: entry.sectionId, deleted: newStrokes, created: entry.created }]);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    if (isSingleEntry(last)) {
      pendingRedoSectionIdRef.current = last.sectionId;
      setRedoPending({ sectionId: last.sectionId, stroke: last.stroke });
    } else {
      pendingRedoBatchRef.current = last;
      setRedoBatchPending(last);
    }
  }, [redoStack]);

  const handleRedoConsumed = useCallback((newStroke: Stroke) => {
    const sectionId = pendingRedoSectionIdRef.current;
    pendingRedoSectionIdRef.current = null;
    setRedoPending(null);
    if (sectionId != null) setUndoStack((prev) => [...prev, { sectionId, stroke: newStroke }]);
  }, []);

  const handleRedoBatchConsumed = useCallback((newStrokes: Stroke[]) => {
    const entry = pendingRedoBatchRef.current;
    pendingRedoBatchRef.current = null;
    setRedoBatchPending(null);
    if (!entry || !("kind" in entry)) return;
    if (entry.kind === "batch-delete") {
      setUndoStack((prev) => [...prev, { kind: "batch-delete", sectionId: entry.sectionId, strokes: entry.strokes }]);
    } else if (entry.kind === "batch-move") {
      setUndoStack((prev) => [...prev, { kind: "batch-move", sectionId: entry.sectionId, deleted: entry.deleted, created: newStrokes }]);
    }
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
          availableTools={["auto", "hand", "pen", "stroke-eraser", "segment-eraser", "stroke-select"]}
          activeOverride={hwOverride}
          disableCompact
        />
        <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
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
            color: "var(--text-dim)",
            fontSize: 14,
            background: "var(--bg-card)",
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
          mode={tool}
          onHwOverrideChange={setHwOverride}
          onDelete={() => deleteSection(section.id)}
          onStrokeCommitted={(stroke) => handleStrokeCommitted(section.id, stroke)}
          undoPending={undoPending?.sectionId === section.id ? undoPending.strokeId : null}
          onUndoConsumed={handleUndoConsumed}
          redoPending={redoPending?.sectionId === section.id ? redoPending.stroke : null}
          onRedoConsumed={handleRedoConsumed}
          undoBatchPending={undoBatchPending && "kind" in undoBatchPending && undoBatchPending.sectionId === section.id ? undoBatchPending : null}
          onUndoBatchConsumed={handleUndoBatchConsumed}
          redoBatchPending={redoBatchPending && "kind" in redoBatchPending && redoBatchPending.sectionId === section.id ? redoBatchPending : null}
          onRedoBatchConsumed={handleRedoBatchConsumed}
          onBatchOperation={handleBatchOperation}
        />
      ))}

      <button
        onClick={addSection}
        disabled={adding}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          borderRadius: 4,
          border: "1px dashed var(--border)",
          background: "transparent",
          cursor: "pointer",
          fontSize: 13,
          color: "var(--text-muted)",
          alignSelf: "flex-start",
        }}
      >
        {adding ? "Adding…" : "+ Add section"}
      </button>
    </div>
  );
}
