import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { notes as notesApi } from "@/api";
import { NoteEditor } from "@/components/NoteEditor";
import MergeModal from "./MergeModal";
import type { Note } from "@/types";

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
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

  return (
    <div style={styles.page}>
      <div style={{ ...styles.header, display: "flex", alignItems: "center" }}>
        <h1 style={styles.title}>{note.name}</h1>
        <button onClick={() => setMerging(true)} style={styles.mergeBtn}>
          Merge into…
        </button>
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
    padding: "20px 32px 12px",
    borderBottom: "1px solid #e0ddd8",
    background: "#f8f6f2",
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 500,
    color: "#2a2a2a",
  },
  body: {
    padding: "24px 32px",
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    flex: 1,
  },
  mergeBtn: {
    marginLeft: "auto",
    padding: "5px 12px",
    fontSize: 12,
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
