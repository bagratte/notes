import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { sections as sectionsApi } from "@/api";
import type { Section, ToolMode, Stroke, NoteUndoEntry } from "@/types";
import SectionCanvas from "./SectionCanvas";
import type { PenSettings } from "@/components/Toolbar";

export interface NoteEditorHandle {
  undo: () => void;
  redo: () => void;
}

interface Props {
  noteId: number;
  pen: PenSettings;
  tool: ToolMode;
  onHwOverrideChange: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  onUndoRedoChange: (canUndo: boolean, canRedo: boolean) => void;
}

type ClipboardStroke = { points: [number, number, number][]; color: string; width: number };

function isSingleEntry(e: NoteUndoEntry): e is { sectionId: number; stroke: Stroke } {
  return !("kind" in e);
}

const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  { noteId, pen, tool, onHwOverrideChange, onUndoRedoChange },
  ref
) {
  const [sectionList, setSectionList] = useState<Section[]>([]);
  const [adding, setAdding] = useState(false);
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
  const [clipboard, setClipboard] = useState<ClipboardStroke[] | null>(null);
  const [focusedSectionId, setFocusedSectionId] = useState<number | null>(null);
  const [pastePending, setPastePending] = useState<{ sectionId: number; strokes: ClipboardStroke[] } | null>(null);
  const pendingPasteSectionIdRef = useRef<number | null>(null);

  useEffect(() => {
    sectionsApi.list(noteId).then(setSectionList);
  }, [noteId]);

  useEffect(() => {
    onUndoRedoChange(undoStack.length > 0, redoStack.length > 0);
  }, [undoStack.length, redoStack.length, onUndoRedoChange]);

  const handleStrokeCommitted = useCallback((sectionId: number, stroke: Stroke) => {
    setUndoStack((prev) => [...prev, { sectionId, stroke }]);
    setRedoStack([]);
  }, []);

  const handleBatchOperation = useCallback((entry: NoteUndoEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }, []);

  const handleCopy = useCallback((strokes: Stroke[]) => {
    setClipboard(strokes.map(s => ({ points: s.points, color: s.color, width: s.width })));
  }, []);

  const handlePasteRequest = useCallback((sectionId: number) => {
    if (!clipboard || clipboard.length === 0) return;
    pendingPasteSectionIdRef.current = sectionId;
    setPastePending({ sectionId, strokes: clipboard });
  }, [clipboard]);

  const handlePasteConsumed = useCallback((created: Stroke[]) => {
    const sectionId = pendingPasteSectionIdRef.current;
    pendingPasteSectionIdRef.current = null;
    setPastePending(null);
    if (sectionId != null) {
      setUndoStack(prev => [...prev, { kind: "batch-paste", sectionId, created }]);
      setRedoStack([]);
    }
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
    if (entry.kind === "batch-delete") {
      setRedoStack((prev) => [...prev, { kind: "batch-delete", sectionId: entry.sectionId, strokes: newStrokes }]);
    } else if (entry.kind === "batch-move") {
      setRedoStack((prev) => [...prev, { kind: "batch-move", sectionId: entry.sectionId, deleted: newStrokes, created: entry.created }]);
    } else if (entry.kind === "batch-duplicate") {
      setRedoStack((prev) => [...prev, { kind: "batch-duplicate", sectionId: entry.sectionId, created: entry.created }]);
    } else if (entry.kind === "batch-paste") {
      setRedoStack((prev) => [...prev, { kind: "batch-paste", sectionId: entry.sectionId, created: entry.created }]);
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
    } else if (entry.kind === "batch-duplicate") {
      setUndoStack((prev) => [...prev, { kind: "batch-duplicate", sectionId: entry.sectionId, created: newStrokes }]);
    } else if (entry.kind === "batch-paste") {
      setUndoStack((prev) => [...prev, { kind: "batch-paste", sectionId: entry.sectionId, created: newStrokes }]);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    undo: handleUndo,
    redo: handleRedo,
  }), [handleUndo, handleRedo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && focusedSectionId != null) {
        e.preventDefault();
        handlePasteRequest(focusedSectionId);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusedSectionId, handlePasteRequest]);

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
          onHwOverrideChange={onHwOverrideChange}
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
          onCopy={handleCopy}
          onPasteRequest={() => handlePasteRequest(section.id)}
          hasClipboard={clipboard !== null && clipboard.length > 0}
          pastePending={pastePending?.sectionId === section.id ? pastePending.strokes : null}
          onPasteConsumed={handlePasteConsumed}
          onFocused={() => setFocusedSectionId(section.id)}
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
});

export default NoteEditor;
