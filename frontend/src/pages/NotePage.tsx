import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { notes as notesApi } from "@/api";
import { NoteEditor } from "@/components/NoteEditor";
import MergeModal from "@/components/MergeModal";
import type { Note } from "@/types";

function RenameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 3h3M10.5 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 2v3.5A4.5 4.5 0 007.5 10H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 2v1.5A4.5 4.5 0 018.5 8H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!noteId) return;
    setNote(null);
    setMissing(false);
    notesApi.get(Number(noteId)).then(setNote).catch(() => setMissing(true));
  }, [noteId]);

  if (missing) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "#aaa", fontSize: 14 }}>Note not found.</span>
      </div>
    );
  }

  if (!note) {
    return <div style={styles.centered}><span style={{ color: "#ccc", fontSize: 14 }}>Loading…</span></div>;
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
      <div style={{ ...styles.header, display: "flex", alignItems: "center" }}>
        <h1 style={styles.title}>{note.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={renameNote} style={styles.actionBtn}><RenameIcon /> Rename</button>
          <button onClick={deleteNote} style={styles.actionBtn}><DeleteIcon /> Delete</button>
          <button onClick={() => setMerging(true)} style={styles.actionBtn}><MergeIcon /> Merge into…</button>
        </div>
      </div>
      <div style={styles.body}>
        <NoteEditor noteId={note.id} />
      </div>
      {merging && (
        <MergeModal sourceNoteId={note.id} onClose={() => setMerging(false)} />
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  header: {
    height: 50,
    padding: "0 32px",
    borderBottom: "1px solid #e0ddd8",
    background: "#f8f6f2",
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    display: "flex" as const,
    alignItems: "center" as const,
  },
  title: {
    fontSize: 20,
    fontWeight: 500,
    color: "#2a2a2a",
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  body: {
    padding: "24px 32px",
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    flex: 1,
  },
  actionBtn: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 5,
    padding: "5px 11px",
    fontSize: 13,
    border: "1px solid #ddd",
    borderRadius: 5,
    background: "#fff",
    cursor: "pointer",
    color: "#555",
    flexShrink: 0,
  },
  centered: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
