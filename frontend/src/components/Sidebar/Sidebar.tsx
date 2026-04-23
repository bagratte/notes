import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { folders as foldersApi, notes as notesApi, documents as docsApi } from "@/api";
import type { Folder, Note, Document } from "@/types";
import css from "./Sidebar.module.css";

// ── tiny inline icons ──────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`${css.chevron}${open ? " " + css.open : ""}`} viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface SidebarData {
  folders: Folder[];
  notes: Note[];
  documents: Document[];
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState<SidebarData>({ folders: [], notes: [], documents: [] });
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const [flds, nts, docs] = await Promise.all([
        foldersApi.list(), notesApi.list(), docsApi.list(),
      ]);
      setData({ folders: flds, notes: nts, documents: docs });
      setExpandedFolders(new Set(flds.map((f) => f.id)));
    } catch (err) {
      console.error("Failed to load sidebar data:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── create operations ────────────────────────────────────────────────────

  const createFolder = async (parentFolderId?: number) => {
    const name = window.prompt("Folder name:");
    if (!name?.trim()) return;
    const folder = await foldersApi.create(name.trim(), parentFolderId);
    setData((d) => ({ ...d, folders: [...d.folders, folder] }));
    setExpandedFolders((s) => new Set([...s, folder.id]));
  };

  const createNote = async (folderId?: number) => {
    const name = window.prompt("Note name:", "Untitled Note");
    if (!name?.trim()) return;
    const note = await notesApi.create(name.trim(), folderId);
    setData((d) => ({ ...d, notes: [...d.notes, note] }));
    navigate(`/notes/${note.id}`);
  };

  const uploadDocument = async (folderId?: number) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      accept: ".pdf,.djvu",
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = window.prompt("Document name:", file.name.replace(/\.[^.]+$/, "")) ?? file.name;
      const doc = await docsApi.upload(name.trim(), file, folderId);
      setData((d) => ({ ...d, documents: [...d.documents, doc] }));
      navigate(`/documents/${doc.id}`);
    };
    input.click();
  };

  // ── rename / delete ──────────────────────────────────────────────────────

  const renameFolder = async (folder: Folder) => {
    const name = window.prompt("Rename folder:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    const updated = await foldersApi.update(folder.id, name.trim());
    setData((d) => ({ ...d, folders: d.folders.map((f) => (f.id === folder.id ? updated : f)) }));
  };

  const deleteFolder = async (folder: Folder) => {
    if (!window.confirm(`Delete "${folder.name}" and everything inside?`)) return;
    await foldersApi.delete(folder.id);
    await load();
  };

  const renameNote = async (note: Note) => {
    const name = window.prompt("Rename note:", note.name);
    if (!name?.trim() || name === note.name) return;
    const updated = await notesApi.update(note.id, name.trim());
    setData((d) => ({ ...d, notes: d.notes.map((n) => (n.id === note.id ? updated : n)) }));
  };

  const deleteNote = async (note: Note) => {
    if (!window.confirm(`Delete "${note.name}"?`)) return;
    await notesApi.delete(note.id);
    setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== note.id) }));
    if (location.pathname === `/notes/${note.id}`) navigate("/");
  };

  const renameDocument = async (doc: Document) => {
    const name = window.prompt("Rename document:", doc.name);
    if (!name?.trim() || name === doc.name) return;
    const updated = await docsApi.update(doc.id, name.trim());
    setData((d) => ({ ...d, documents: d.documents.map((d2) => (d2.id === doc.id ? updated : d2)) }));
  };

  const deleteDocument = async (doc: Document) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    await docsApi.delete(doc.id);
    setData((d) => ({ ...d, documents: d.documents.filter((d2) => d2.id !== doc.id) }));
    if (location.pathname === `/documents/${doc.id}`) navigate("/");
  };

  // ── toggle ───────────────────────────────────────────────────────────────

  const toggleFolder = (id: number) =>
    setExpandedFolders((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── render ───────────────────────────────────────────────────────────────

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const renderNote = (note: Note, indent: number) => {
    const active = location.pathname === `/notes/${note.id}`;
    return (
      <div
        key={note.id}
        className={`${css.leafRow}${active ? " " + css.active : ""}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => navigate(`/notes/${note.id}`)}
      >
        <NoteIcon />
        <span className={css.rowLabel}>{note.name}</span>
        <div className={css.rowActions} onClick={stop}>
          <button className={css.iconBtn} title="Rename" onClick={() => renameNote(note)}>✎</button>
          <button className={css.iconBtn} title="Delete" onClick={() => deleteNote(note)}>✕</button>
        </div>
      </div>
    );
  };

  const renderDocument = (doc: Document, indent: number) => {
    const active = location.pathname === `/documents/${doc.id}`;
    return (
      <div
        key={doc.id}
        className={`${css.leafRow}${active ? " " + css.active : ""}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => navigate(`/documents/${doc.id}`)}
      >
        <DocIcon />
        <span className={css.rowLabel}>{doc.name}</span>
        <div className={css.rowActions} onClick={stop}>
          <button className={css.iconBtn} title="Rename" onClick={() => renameDocument(doc)}>✎</button>
          <button className={css.iconBtn} title="Delete" onClick={() => deleteDocument(doc)}>✕</button>
        </div>
      </div>
    );
  };

  const renderFolder = (folder: Folder, indent: number): JSX.Element => {
    const children = data.folders.filter((f) => f.parent_folder_id === folder.id);
    const folderNotes = data.notes.filter((n) => n.folder_id === folder.id);
    const folderDocs = data.documents.filter((d) => d.folder_id === folder.id);
    const isOpen = expandedFolders.has(folder.id);

    return (
      <div key={folder.id}>
        <div className={css.folderRow} style={{ paddingLeft: `${indent}px` }} onClick={() => toggleFolder(folder.id)}>
          <ChevronIcon open={isOpen} />
          <span className={css.rowLabel}>{folder.name}</span>
          <div className={css.rowActions} onClick={stop}>
            <button className={css.iconBtn} title="New note" onClick={() => createNote(folder.id)}>✎</button>
            <button className={css.iconBtn} title="Upload document" onClick={() => uploadDocument(folder.id)}>↑</button>
            <button className={css.iconBtn} title="New subfolder" onClick={() => createFolder(folder.id)}>+</button>
            <button className={css.iconBtn} title="Rename" onClick={() => renameFolder(folder)}>✎</button>
            <button className={css.iconBtn} title="Delete" onClick={() => deleteFolder(folder)}>✕</button>
          </div>
        </div>

        {isOpen && (
          <>
            {children.map((child) => renderFolder(child, indent + 16))}
            {folderNotes.map((note) => renderNote(note, indent + 16))}
            {folderDocs.map((doc) => renderDocument(doc, indent + 16))}
            {children.length === 0 && folderNotes.length === 0 && folderDocs.length === 0 && (
              <div style={{ paddingLeft: `${indent + 16}px`, padding: "4px 8px 4px " + (indent + 16) + "px", fontSize: 12, color: "#bbb" }}>
                Empty folder
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const rootFolders = data.folders.filter((f) => f.parent_folder_id === null);
  const rootNotes = data.notes.filter((n) => n.folder_id === null);
  const rootDocs = data.documents.filter((d) => d.folder_id === null);
  const isEmpty = rootFolders.length === 0 && rootNotes.length === 0 && rootDocs.length === 0;

  return (
    <nav className={css.sidebar}>
      <div className={css.sidebarHeader}>
        <span>Notes</span>
        <button className={css.iconBtn} title="New folder" onClick={() => createFolder()}>+</button>
      </div>

      <div className={css.tree}>
        {isEmpty && (
          <div className={css.emptyState}>
            No folders yet.<br />Click + to create one.
          </div>
        )}

        {rootFolders.map((folder) => renderFolder(folder, 8))}
        {rootNotes.map((note) => renderNote(note, 8))}
        {rootDocs.map((doc) => renderDocument(doc, 8))}
      </div>

      <button className={css.addNotebookBtn} onClick={() => createFolder()}>
        + New folder
      </button>
    </nav>
  );
}
