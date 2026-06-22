import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { notes as notesApi } from "@/api";
import { NoteEditor } from "@/components/NoteEditor";
import type { NoteEditorHandle } from "@/components/NoteEditor";
import { PageHeader, RenameIcon, DeleteIcon, actionBtn } from "@/components/PageHeader";
import { Toolbar, DEFAULT_PEN } from "@/components/Toolbar";
import type { PenSettings } from "@/components/Toolbar";
import { UndoRedoBar } from "@/components/UndoRedoBar";
import type { Note, ToolMode } from "@/types";

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);

  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [tool, setTool] = useState<ToolMode>("auto");
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const editorRef = useRef<NoteEditorHandle>(null);

  const handleUndoRedoChange = useCallback((u: boolean, r: boolean) => {
    setCanUndo(u);
    setCanRedo(r);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) editorRef.current?.redo(); else editorRef.current?.undo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!noteId) return;
    setNote(null);
    setMissing(false);
    notesApi.get(Number(noteId)).then(setNote).catch(() => setMissing(true));
  }, [noteId]);

  if (missing) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Note not found.</span>
      </div>
    );
  }

  if (!note) {
    return <div style={styles.centered}><span style={{ color: "var(--text-ghost)", fontSize: 14 }}>Loading…</span></div>;
  }

  const renameNote = async () => {
    const name = window.prompt("Rename note:", note.name);
    if (!name?.trim() || name === note.name) return;
    const updated = await notesApi.update(note.id, name.trim());
    setNote(updated);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
  };

  const deleteNote = async () => {
    if (!window.confirm(`Delete "${note.name}"?`)) return;
    await notesApi.delete(note.id);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate("/");
  };

  return (
    <div style={styles.page}>
      <PageHeader
        title={note.name}
        sticky
        actions={
          <>
            <button onClick={renameNote} style={actionBtn}><RenameIcon /> Rename</button>
            <button onClick={deleteNote} style={actionBtn}><DeleteIcon /> Delete</button>
          </>
        }
      />

      <div style={styles.toolbar}>
        <Toolbar
          settings={pen}
          onChange={setPen}
          tool={tool}
          onToolChange={setTool}
          availableTools={["auto", "hand", "pen", "highlighter", "stroke-eraser", "segment-eraser", "stroke-select"]}
          activeOverride={hwOverride}
          disableCompact
        />
        <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
        <UndoRedoBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
        />
      </div>

      <div style={styles.body}>
        <NoteEditor
          ref={editorRef}
          noteId={note.id}
          pen={pen}
          tool={tool}
          onHwOverrideChange={setHwOverride}
          onUndoRedoChange={handleUndoRedoChange}
        />
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  toolbar: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 6,
    padding: "6px 24px",
    borderBottom: "1px solid var(--border-soft)",
    background: "var(--bg-header)",
    position: "sticky" as const,
    top: 50,
    zIndex: 1,
    flexShrink: 0,
  },
  body: {
    padding: "24px 24px",
    paddingBottom: "80vh",
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    flex: 1,
  },
  centered: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
