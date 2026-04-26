import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { folders as foldersApi, notes as notesApi, documents as docsApi } from "@/api";
import type { Folder, Note, Document } from "@/types";

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

function NewNoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11" cy="11" r="5" fill="currentColor" />
      <path d="M11 8.5v5M8.5 11h5" stroke="#f5f1eb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M1 2a1 1 0 011-1h4l1.5 2H14a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="11" r="5" fill="currentColor" />
      <path d="M11 8.5v5M8.5 11h5" stroke="#f5f1eb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v9M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: "#888" }}>
      <path d="M1 2a1 1 0 011-1h4l1.5 2H14a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2z"
            stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: "#888" }}>
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: "#888" }}>
      <path d="M2 2.5A1.5 1.5 0 013.5 1H9l3 3v8.5A1.5 1.5 0 0110.5 14H3.5A1.5 1.5 0 012 12.5V2.5z"
            stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function FolderItem({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={styles.item}>
      <FolderIcon />
      <span style={styles.itemName}>{name}</span>
    </div>
  );
}

function NoteItem({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={styles.item}>
      <NoteIcon />
      <span style={styles.itemName}>{name}</span>
    </div>
  );
}

function DocItem({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={styles.item}>
      <DocIcon />
      <span style={styles.itemName}>{name}</span>
    </div>
  );
}

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const id = folderId ? Number(folderId) : 0;
  const [folder, setFolder] = useState<Folder | null>(null);
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    setFolder(null);
    setMissing(false);
    Promise.all([
      foldersApi.get(id),
      foldersApi.list(id),
      notesApi.list({ folderId: id }),
      docsApi.list({ folderId: id }),
    ])
      .then(([f, subs, nts, dcs]) => {
        setFolder(f);
        setSubfolders(subs);
        setNotes(nts);
        setDocs(dcs);
      })
      .catch(() => setMissing(true));
  }, [folderId]);

  if (missing) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "#aaa", fontSize: 14 }}>Folder not found.</span>
      </div>
    );
  }

  if (!folder) {
    return <div style={styles.centered}><span style={{ color: "#ccc", fontSize: 14 }}>Loading…</span></div>;
  }

  const renameFolder = async () => {
    const name = window.prompt("Rename folder:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    const updated = await foldersApi.update(id, name.trim());
    setFolder(updated);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
  };

  const deleteFolder = async () => {
    if (!window.confirm(`Delete "${folder.name}" and everything inside?`)) return;
    await foldersApi.delete(id);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate("/");
  };

  const createNote = async () => {
    const name = window.prompt("Note name:", "Untitled Note");
    if (!name?.trim()) return;
    const note = await notesApi.create(name.trim(), id);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate(`/notes/${note.id}`);
  };

  const createSubfolder = async () => {
    const name = window.prompt("Folder name:");
    if (!name?.trim()) return;
    await foldersApi.create(name.trim(), id);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    const subs = await foldersApi.list(id);
    setSubfolders(subs);
  };

  const uploadDocument = async () => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".pdf,.djvu" });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = window.prompt("Document name:", file.name) ?? file.name;
      const doc = await docsApi.upload(name.trim(), file, id);
      window.dispatchEvent(new CustomEvent("sidebar:refresh"));
      navigate(`/documents/${doc.id}`);
    };
    input.click();
  };

  const isEmpty = subfolders.length === 0 && notes.length === 0 && docs.length === 0;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>{folder.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={createNote} style={styles.actionBtn}><NewNoteIcon /> New Note</button>
          <button onClick={createSubfolder} style={styles.actionBtn}><NewFolderIcon /> New Folder</button>
          <button onClick={uploadDocument} style={styles.actionBtn}><UploadIcon /> Upload</button>
          <button onClick={renameFolder} style={styles.actionBtn}><RenameIcon /> Rename</button>
          <button onClick={deleteFolder} style={styles.actionBtn}><DeleteIcon /> Delete</button>
        </div>
      </div>
      <div style={styles.body}>
        {isEmpty ? (
          <p style={styles.emptyState}>This folder is empty.</p>
        ) : (
          <>
            {subfolders.length > 0 && (
              <section style={styles.section}>
                <p style={styles.sectionLabel}>Folders</p>
                {subfolders.map((f) => (
                  <FolderItem key={f.id} name={f.name} onClick={() => navigate(`/folders/${f.id}`)} />
                ))}
              </section>
            )}
            {notes.length > 0 && (
              <section style={styles.section}>
                <p style={styles.sectionLabel}>Notes</p>
                {notes.map((n) => (
                  <NoteItem key={n.id} name={n.name} onClick={() => navigate(`/notes/${n.id}`)} />
                ))}
              </section>
            )}
            {docs.length > 0 && (
              <section style={styles.section}>
                <p style={styles.sectionLabel}>Documents</p>
                {docs.map((d) => (
                  <DocItem key={d.id} name={d.name} onClick={() => navigate(`/documents/${d.id}`)} />
                ))}
              </section>
            )}
          </>
        )}
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
  section: {
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#aaa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    margin: "0 0 8px",
  },
  item: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: "10px 12px",
    minHeight: 44,
    borderRadius: 6,
    cursor: "pointer",
    color: "#2a2a2a",
    fontSize: 15,
    background: "#fff",
    border: "1px solid #e8e5e0",
    marginBottom: 6,
  },
  itemName: {
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  emptyState: {
    color: "#bbb",
    fontSize: 14,
    marginTop: 32,
    textAlign: "center" as const,
  },
  centered: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
};
