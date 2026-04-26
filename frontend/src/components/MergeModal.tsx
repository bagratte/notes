import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notes as notesApi } from "@/api";
import type { Note } from "@/types";

interface Props {
  sourceNoteId: number;
  onClose: () => void;
}

export default function MergeModal({ sourceNoteId, onClose }: Props) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    notesApi.list().then((all) => setNotes(all.filter((n) => n.id !== sourceNoteId)));
  }, [sourceNoteId]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleMerge = async (targetId: number) => {
    setBusyId(targetId);
    await notesApi.merge(sourceNoteId, targetId);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    onClose();
    navigate(`/notes/${targetId}`);
  };

  const filtered = notes.filter((n) =>
    n.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={header}>Merge into…</div>
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          style={searchInput}
        />
        <div style={list}>
          {filtered.length === 0 && (
            <div style={empty}>No other notes found.</div>
          )}
          {filtered.map((n) => (
            <button
              key={n.id}
              disabled={busyId !== null}
              onClick={() => handleMerge(n.id)}
              style={{ ...row, opacity: busyId === n.id ? 0.5 : 1 }}
            >
              {busyId === n.id ? "Merging…" : n.name}
            </button>
          ))}
        </div>
        <div style={footer}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.3)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 100,
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  width: 380,
  maxHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  padding: "16px 20px 12px",
  fontSize: 15,
  fontWeight: 600,
  color: "#2a2a2a",
  borderBottom: "1px solid #eeebe6",
};

const searchInput: React.CSSProperties = {
  margin: "12px 20px 8px",
  padding: "7px 10px",
  border: "1px solid #ddd",
  borderRadius: 5,
  fontSize: 13,
  outline: "none",
};

const list: React.CSSProperties = {
  overflowY: "auto",
  flex: 1,
  padding: "4px 0",
};

const empty: React.CSSProperties = {
  padding: "16px 20px",
  color: "#aaa",
  fontSize: 13,
};

const row: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 20px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  color: "#2a2a2a",
};

const footer: React.CSSProperties = {
  padding: "10px 20px",
  borderTop: "1px solid #eeebe6",
  display: "flex",
  justifyContent: "flex-end",
};

const cancelBtn: React.CSSProperties = {
  padding: "6px 14px",
  border: "1px solid #ddd",
  borderRadius: 5,
  background: "#fff",
  fontSize: 13,
  cursor: "pointer",
  color: "#555",
};
