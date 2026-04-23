import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { notebooks as nbApi, folders as foldersApi, notes as notesApi, documents as docsApi } from "@/api";
import type { Notebook, Folder, Note, Document } from "@/types";
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
  notebooks: Notebook[];
  folders: Folder[];
  notes: Note[];
  documents: Document[];
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState<SidebarData>({ notebooks: [], folders: [], notes: [], documents: [] });
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const [nbs, flds, nts, docs] = await Promise.all([
        nbApi.list(), foldersApi.list(), notesApi.list(), docsApi.list(),
      ]);
      setData({ notebooks: nbs, folders: flds, notes: nts, documents: docs });
      // auto-expand everything on first load
      setExpandedNotebooks(new Set(nbs.map((n) => n.id)));
      setExpandedFolders(new Set(flds.map((f) => f.id)));
    } catch (err) {
      console.error("Failed to load sidebar data:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── create operations ────────────────────────────────────────────────────

  const createNotebook = async () => {
    const name = window.prompt("Notebook name:");
    if (!name?.trim()) return;
    const nb = await nbApi.create(name.trim());
    setData((d) => ({ ...d, notebooks: [...d.notebooks, nb] }));
    setExpandedNotebooks((s) => new Set([...s, nb.id]));
  };

  const createFolder = async (notebookId: number) => {
    const name = window.prompt("Folder name:");
    if (!name?.trim()) return;
    const folder = await foldersApi.create(notebookId, name.trim());
    setData((d) => ({ ...d, folders: [...d.folders, folder] }));
    setExpandedFolders((s) => new Set([...s, folder.id]));
  };

  const createNote = async (folderId: number) => {
    const name = window.prompt("Note name:", "Untitled Note");
    if (!name?.trim()) return;
    const note = await notesApi.create({ folderId }, name.trim());
    setData((d) => ({ ...d, notes: [...d.notes, note] }));
    navigate(`/notes/${note.id}`);
  };

  const createNoteInNotebook = async (notebookId: number) => {
    const name = window.prompt("Note name:", "Untitled Note");
    if (!name?.trim()) return;
    const note = await notesApi.create({ notebookId }, name.trim());
    setData((d) => ({ ...d, notes: [...d.notes, note] }));
    navigate(`/notes/${note.id}`);
  };

  const uploadDocument = async (folderId: number) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      accept: ".pdf,.djvu",
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = window.prompt("Document name:", file.name.replace(/\.[^.]+$/, "")) ?? file.name;
      const doc = await docsApi.upload({ folderId }, name.trim(), file);
      setData((d) => ({ ...d, documents: [...d.documents, doc] }));
      navigate(`/documents/${doc.id}`);
    };
    input.click();
  };

  const uploadDocumentInNotebook = async (notebookId: number) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      accept: ".pdf,.djvu",
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = window.prompt("Document name:", file.name.replace(/\.[^.]+$/, "")) ?? file.name;
      const doc = await docsApi.upload({ notebookId }, name.trim(), file);
      setData((d) => ({ ...d, documents: [...d.documents, doc] }));
      navigate(`/documents/${doc.id}`);
    };
    input.click();
  };

  // ── rename / delete ──────────────────────────────────────────────────────

  const renameNotebook = async (nb: Notebook) => {
    const name = window.prompt("Rename notebook:", nb.name);
    if (!name?.trim() || name === nb.name) return;
    const updated = await nbApi.update(nb.id, name.trim());
    setData((d) => ({ ...d, notebooks: d.notebooks.map((n) => (n.id === nb.id ? updated : n)) }));
  };

  const deleteNotebook = async (nb: Notebook) => {
    if (!window.confirm(`Delete "${nb.name}" and everything inside?`)) return;
    await nbApi.delete(nb.id);
    setData((d) => {
      const deletedFolderIds = new Set(d.folders.filter((f) => f.notebook_id === nb.id).map((f) => f.id));
      return {
        ...d,
        notebooks: d.notebooks.filter((n) => n.id !== nb.id),
        folders: d.folders.filter((f) => f.notebook_id !== nb.id),
        notes: d.notes.filter((n) => n.notebook_id !== nb.id && (n.folder_id === null || !deletedFolderIds.has(n.folder_id))),
        documents: d.documents.filter((doc) => doc.notebook_id !== nb.id && (doc.folder_id === null || !deletedFolderIds.has(doc.folder_id))),
      };
    });
  };

  const renameFolder = async (folder: Folder) => {
    const name = window.prompt("Rename folder:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    const updated = await foldersApi.update(folder.id, name.trim());
    setData((d) => ({ ...d, folders: d.folders.map((f) => (f.id === folder.id ? updated : f)) }));
  };

  const deleteFolder = async (folder: Folder) => {
    if (!window.confirm(`Delete "${folder.name}" and everything inside?`)) return;
    await foldersApi.delete(folder.id);
    setData((d) => ({
      ...d,
      folders: d.folders.filter((f) => f.id !== folder.id),
      notes: d.notes.filter((n) => n.folder_id !== folder.id),
      documents: d.documents.filter((doc) => doc.folder_id !== folder.id),
    }));
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

  // ── toggle helpers ───────────────────────────────────────────────────────

  const toggleNotebook = (id: number) =>
    setExpandedNotebooks((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleFolder = (id: number) =>
    setExpandedFolders((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── render ───────────────────────────────────────────────────────────────

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <nav className={css.sidebar}>
      <div className={css.sidebarHeader}>
        <span>Notes</span>
        <button className={css.iconBtn} title="New notebook" onClick={createNotebook}>+</button>
      </div>

      <div className={css.tree}>
        {data.notebooks.length === 0 && (
          <div className={css.emptyState}>
            No notebooks yet.<br />Click + to create one.
          </div>
        )}

        {data.notebooks.map((nb) => {
          const nbFolders = data.folders.filter((f) => f.notebook_id === nb.id);
          const nbNotes = data.notes.filter((n) => n.notebook_id === nb.id);
          const nbDocs = data.documents.filter((d) => d.notebook_id === nb.id);
          const isNbOpen = expandedNotebooks.has(nb.id);

          return (
            <div key={nb.id}>
              <div className={css.notebookRow} onClick={() => toggleNotebook(nb.id)}>
                <ChevronIcon open={isNbOpen} />
                <span className={css.rowLabel}>{nb.name}</span>
                <div className={css.rowActions} onClick={stop}>
                  <button className={css.iconBtn} title="New note" onClick={() => createNoteInNotebook(nb.id)}>✎</button>
                  <button className={css.iconBtn} title="Upload document" onClick={() => uploadDocumentInNotebook(nb.id)}>↑</button>
                  <button className={css.iconBtn} title="New folder" onClick={() => createFolder(nb.id)}>+</button>
                  <button className={css.iconBtn} title="Rename" onClick={() => renameNotebook(nb)}>✎</button>
                  <button className={css.iconBtn} title="Delete" onClick={() => deleteNotebook(nb)}>✕</button>
                </div>
              </div>

              {isNbOpen && (
                <>
                  {nbNotes.map((note) => {
                    const active = location.pathname === `/notes/${note.id}`;
                    return (
                      <div
                        key={note.id}
                        className={`${css.leafRow}${active ? " " + css.active : ""}`}
                        style={{ paddingLeft: "calc(var(--indent-nb, 8px) + 16px)" }}
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
                  })}
                  {nbDocs.map((doc) => {
                    const active = location.pathname === `/documents/${doc.id}`;
                    return (
                      <div
                        key={doc.id}
                        className={`${css.leafRow}${active ? " " + css.active : ""}`}
                        style={{ paddingLeft: "calc(var(--indent-nb, 8px) + 16px)" }}
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
                  })}

                  {nbFolders.map((folder) => {
                    const folderNotes = data.notes.filter((n) => n.folder_id === folder.id);
                    const folderDocs = data.documents.filter((d) => d.folder_id === folder.id);
                    const isFolderOpen = expandedFolders.has(folder.id);

                    return (
                      <div key={folder.id}>
                        <div className={css.folderRow} onClick={() => toggleFolder(folder.id)}>
                          <ChevronIcon open={isFolderOpen} />
                          <span className={css.rowLabel}>{folder.name}</span>
                          <div className={css.rowActions} onClick={stop}>
                            <button className={css.iconBtn} title="New note" onClick={() => createNote(folder.id)}>✎</button>
                            <button className={css.iconBtn} title="Upload document" onClick={() => uploadDocument(folder.id)}>↑</button>
                            <button className={css.iconBtn} title="Rename" onClick={() => renameFolder(folder)}>✎</button>
                            <button className={css.iconBtn} title="Delete" onClick={() => deleteFolder(folder)}>✕</button>
                          </div>
                        </div>

                        {isFolderOpen && (
                          <>
                            {folderNotes.map((note) => {
                              const active = location.pathname === `/notes/${note.id}`;
                              return (
                                <div
                                  key={note.id}
                                  className={`${css.leafRow}${active ? " " + css.active : ""}`}
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
                            })}
                            {folderDocs.map((doc) => {
                              const active = location.pathname === `/documents/${doc.id}`;
                              return (
                                <div
                                  key={doc.id}
                                  className={`${css.leafRow}${active ? " " + css.active : ""}`}
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
                            })}
                            {folderNotes.length === 0 && folderDocs.length === 0 && (
                              <div style={{ padding: "4px 8px 4px 34px", fontSize: 12, color: "#bbb" }}>
                                Empty folder
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>

      <button className={css.addNotebookBtn} onClick={createNotebook}>
        + New notebook
      </button>
    </nav>
  );
}
