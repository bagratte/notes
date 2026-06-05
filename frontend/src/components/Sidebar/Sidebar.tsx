import { useEffect, useState, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { folders as foldersApi, notes as notesApi, documents as docsApi, strokes as strokesApi, regions as regionsApi, sections as sectionsApi } from "@/api";
import type { Folder, Note, Document } from "@/types";
import type { TocEntry } from "@/components/DocumentViewer/viewerTypes";
import MergeModal from "@/components/MergeModal";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import { useTouchMode } from "@/context/TouchMode";
import { useTheme } from "@/context/Theme";
import { useTouchReorder } from "./useTouchReorder";
import type { DragItem } from "./useTouchReorder";
import css from "./Sidebar.module.css";

// ── tiny inline icons ──────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`${css.chevron}${open ? " " + css.open : ""}`} viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path
        d="M6.2 1.4h3.6l.45 1.55c.35.11.68.3.99.52l1.56-.53 1.8 3.12-1.12 1.13c.05.37.05.74 0 1.1l1.12 1.13-1.8 3.12-1.56-.53c-.31.22-.64.41-.99.52l-.45 1.55H6.2l-.45-1.55a3.83 3.83 0 0 1-.99-.52l-1.56.53-1.8-3.12 1.12-1.13a4.47 4.47 0 0 1 0-1.1L1.4 6.1l1.8-3.12 1.56.53c.31-.22.64-.41.99-.52L6.2 1.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TouchModeIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M8 2a2 2 0 0 0-2 2v5a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 7.5H4.5A1.5 1.5 0 0 0 3 9v.5A5 5 0 0 0 13 9.5V9A1.5 1.5 0 0 0 11.5 7.5H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NewNoteIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11" cy="11" r="5" fill="currentColor" />
      <path d="M11 8.5v5M8.5 11h5" stroke="#f5f1eb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M1 2a1 1 0 011-1h4l1.5 2H14a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="11" r="5" fill="currentColor" />
      <path d="M11 8.5v5M8.5 11h5" stroke="#f5f1eb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      {/* T */}
      <path d="M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* | cursor */}
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 3h3M10.5 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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

function AnnotatedPageIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M2 2.5A1.5 1.5 0 013.5 1H9l3 3v8.5A1.5 1.5 0 0110.5 14H3.5A1.5 1.5 0 012 12.5V2.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 7l4 4-1.5.5-.5-1.5 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M3 2v3.5A4.5 4.5 0 007.5 10H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 2v1.5A4.5 4.5 0 018.5 8H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M2 2.5A1.5 1.5 0 013.5 1H9l3 3v8.5A1.5 1.5 0 0110.5 14H3.5A1.5 1.5 0 012 12.5V2.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function TocIcon() {
  return (
    <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
      <path d="M3 5h4M3 8h7M3 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface SidebarData {
  folders: Folder[];
  notes: Note[];
  documents: Document[];
  docNotes: Record<number, Note[]>;
  docNotePageNums: Record<number, Record<number, number>>; // docId → noteId → pageNumber
  docAnnotatedPages: Record<number, number[]>;
}

export default function Sidebar({ style, className }: { style?: CSSProperties; className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTouch, toggle: toggleTouchMode } = useTouchMode();
  const { resolvedTheme, setTheme } = useTheme();

  const [data, setData] = useState<SidebarData>({ folders: [], notes: [], documents: [], docNotes: {}, docNotePageNums: {}, docAnnotatedPages: {} });
  const dataRef = useRef(data);
  dataRef.current = data;
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [expandedDocuments, setExpandedDocuments] = useState<Set<number>>(new Set());
  const [mergingNote, setMergingNote] = useState<Note | null>(null);
  const [docToc, setDocToc] = useState<Record<number, TocEntry[]>>({});

  const dragItemRef = useRef<DragItem | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<{ type: "folder" | "document"; id: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<{ id: number; pos: "before" | "after" } | null>(null);
  const [expandedTocPaths, setExpandedTocPaths] = useState<Set<string>>(new Set());
  const [expandedTocRoots, setExpandedTocRoots] = useState<Set<number>>(new Set());
  const [expandedNotesRoots, setExpandedNotesRoots] = useState<Set<number>>(new Set());
  const [uploadModal, setUploadModal] = useState<{ folderId?: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [flds, nts, docs] = await Promise.all([
        foldersApi.list(), notesApi.list(), docsApi.list(),
      ]);
      const [linkedByDoc, pageNumsByDoc, annotatedByDoc] = await Promise.all([
        Promise.all(docs.map((d) => notesApi.list({ documentId: d.id }).then((ns) => [d.id, ns] as const))),
        Promise.all(docs.map(async (d) => {
          const regs = await regionsApi.list({ documentId: d.id });
          const pairs = await Promise.all(regs.map(async (r) => {
            const sec = await sectionsApi.get(r.section_id);
            return { noteId: sec.note_id, pageNumber: r.page_number };
          }));
          const map: Record<number, number> = {};
          for (const { noteId, pageNumber } of pairs)
            if (map[noteId] === undefined || pageNumber < map[noteId]) map[noteId] = pageNumber;
          return [d.id, map] as const;
        })),
        Promise.all(docs.map((d) => strokesApi.annotatedPages(d.id).then((r) => [d.id, r.pages] as const))),
      ]);
      const docNotes = Object.fromEntries(linkedByDoc);
      const docNotePageNums = Object.fromEntries(pageNumsByDoc);
      const docAnnotatedPages = Object.fromEntries(annotatedByDoc);
      setData({ folders: flds, notes: nts, documents: docs, docNotes, docNotePageNums, docAnnotatedPages });
    } catch (err) {
      console.error("Failed to load sidebar data:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener("sidebar:refresh", load);
    return () => window.removeEventListener("sidebar:refresh", load);
  }, [load]);
  useEffect(() => {
    const handler = (e: Event) => {
      const { documentId } = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      strokesApi.annotatedPages(documentId).then((r) => {
        setData((d) => ({
          ...d,
          docAnnotatedPages: { ...d.docAnnotatedPages, [documentId]: r.pages },
        }));
        if (r.pages.length > 0)
          setExpandedDocuments((s) => new Set([...s, documentId]));
      });
    };
    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, []);
  useEffect(() => {
    const handler = (e: Event) => {
      const { documentId, toc } = (e as CustomEvent<{ documentId: number; toc: TocEntry[] }>).detail;
      setDocToc((prev) => ({ ...prev, [documentId]: toc }));
      if (toc.length > 0) {
        setExpandedDocuments((s) => new Set([...s, documentId]));
        setExpandedTocRoots((s) => new Set([...s, documentId]));
      }
    };
    window.addEventListener("document:toc-loaded", handler);
    return () => window.removeEventListener("document:toc-loaded", handler);
  }, []);

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

  const uploadDocument = (folderId?: number) => setUploadModal({ folderId });

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
    setData((d) => ({
      ...d,
      notes: d.notes.filter((n) => n.id !== note.id),
      docNotes: Object.fromEntries(
        Object.entries(d.docNotes).map(([k, ns]) => [k, (ns as Note[]).filter((n) => n.id !== note.id)])
      ),
    }));
    window.dispatchEvent(new CustomEvent("note:deleted", { detail: { noteId: note.id } }));
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

  // Shared reorder used by both native (mouse) drop and touch drop. Reads the
  // latest data via `dataRef` so it stays correct when called from the touch
  // gesture's window listeners (which close over a stale render otherwise).
  const commitReorder = useCallback((item: DragItem, targetId: number, pos: "before" | "after") => {
    if (item.id === targetId) return;
    const scope = item.scope;
    if (item.type === "folder") {
      const target = dataRef.current.folders.find((f) => f.id === targetId);
      if (!target || target.parent_folder_id !== scope) return;
      const siblings = dataRef.current.folders.filter((f) => f.parent_folder_id === scope);
      const fromIdx = siblings.findIndex((f) => f.id === item.id);
      const toIdx = siblings.findIndex((f) => f.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const reordered = [...siblings];
      const [moved] = reordered.splice(fromIdx, 1);
      const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      const insertIdx = pos === "before" ? adjustedToIdx : adjustedToIdx + 1;
      reordered.splice(insertIdx, 0, moved);
      setData((d) => ({ ...d, folders: [...d.folders.filter((f) => f.parent_folder_id !== scope), ...reordered] }));
      foldersApi.reorder(reordered.map((f) => f.id)).catch(() => load());
    } else {
      const target = dataRef.current.documents.find((d) => d.id === targetId);
      if (!target || target.folder_id !== scope) return;
      const siblings = dataRef.current.documents.filter((d) => d.folder_id === scope);
      const fromIdx = siblings.findIndex((d) => d.id === item.id);
      const toIdx = siblings.findIndex((d) => d.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const reordered = [...siblings];
      const [moved] = reordered.splice(fromIdx, 1);
      const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      const insertIdx = pos === "before" ? adjustedToIdx : adjustedToIdx + 1;
      reordered.splice(insertIdx, 0, moved);
      setData((d) => ({ ...d, documents: [...d.documents.filter((d2) => d2.folder_id !== scope), ...reordered] }));
      docsApi.reorder(reordered.map((d) => d.id)).catch(() => load());
    }
  }, [load]);

  const startTouchDrag = useTouchReorder({ dragItemRef, setDraggingId, setDragOverId, commitReorder, suppressClickRef });

  const handleFolderDrop = (targetFolder: Folder) => {
    const item = dragItemRef.current;
    if (item && item.type === "folder")
      commitReorder(item, targetFolder.id, dragOverId?.pos ?? "before");
    dragItemRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDocumentDrop = (targetDoc: Document) => {
    const item = dragItemRef.current;
    if (item && item.type === "document")
      commitReorder(item, targetDoc.id, dragOverId?.pos ?? "before");
    dragItemRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  };

  // ── render ───────────────────────────────────────────────────────────────

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const deleteAnnotatedPage = async (docId: number, pageNum: number) => {
    await strokesApi.deleteForPage(docId, pageNum);
    window.dispatchEvent(new CustomEvent("document:page-strokes-changed",
      { detail: { documentId: docId, pageNumber: pageNum } }));
    setData((d) => ({
      ...d,
      docAnnotatedPages: {
        ...d.docAnnotatedPages,
        [docId]: (d.docAnnotatedPages[docId] ?? []).filter((p) => p !== pageNum),
      },
    }));
  };

  const renderNote = (note: Note, indent: number, prefix?: string, docLink?: { docId: number; page: number }) => {
    const active = docLink
      ? location.pathname === `/documents/${docLink.docId}` &&
        new URLSearchParams(location.search).get("page") === String(docLink.page)
      : location.pathname === `/notes/${note.id}`;
    return (
      <div
        key={note.id}
        className={`${css.leafRow}${active ? " " + css.active : ""}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => navigate(docLink ? `/documents/${docLink.docId}?page=${docLink.page}` : `/notes/${note.id}`)}
      >
        <NoteIcon />
        <span className={css.rowLabel}>{prefix}{note.name}</span>
        <div className={css.rowActions} onClick={stop}>
          <button className={css.iconBtn} title="Merge into" onClick={() => setMergingNote(note)}><MergeIcon /></button>
          <button className={css.iconBtn} title="Rename" onClick={() => renameNote(note)}><RenameIcon /></button>
          <button className={css.iconBtn} title="Delete" onClick={() => deleteNote(note)}>✕</button>
        </div>
      </div>
    );
  };

  const renderTocEntry = (entry: TocEntry, docId: number, indent: number, keyPath: string): JSX.Element => {
    const active = location.pathname === `/documents/${docId}` &&
      new URLSearchParams(location.search).get("page") === String(entry.page);
    const hasChildren = entry.children.length > 0;
    const isOpen = expandedTocPaths.has(keyPath);
    const toggleToc = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedTocPaths((s) => { const n = new Set(s); n.has(keyPath) ? n.delete(keyPath) : n.add(keyPath); return n; });
    };
    return (
      <div key={keyPath}>
        <div
          className={`${css.leafRow}${active ? " " + css.active : ""}`}
          style={{ paddingLeft: `${indent}px` }}
          onClick={() => navigate(`/documents/${docId}?page=${entry.page}`)}
        >
          {hasChildren
            ? <span onClick={toggleToc}><ChevronIcon open={isOpen} /></span>
            : <span style={{ width: 14, display: "inline-block" }} />}
          <TocIcon />
          <span className={css.rowLabel}>{entry.title}</span>
        </div>
        {hasChildren && isOpen && entry.children.map((child, i) => renderTocEntry(child, docId, indent + 16, `${keyPath}-${i}`))}
      </div>
    );
  };

  const renderDocument = (doc: Document, indent: number) => {
    const linked = data.docNotes[doc.id] ?? [];
    const pages = data.docAnnotatedPages[doc.id] ?? [];
    const toc = docToc[doc.id] ?? [];
    const hasChildren = linked.length > 0 || pages.length > 0 || toc.length > 0;
    const isOpen = expandedDocuments.has(doc.id);
    const active = location.pathname === `/documents/${doc.id}`;
    const toggleDoc = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedDocuments((s) => { const n = new Set(s); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; });
    };

    const isDragging = draggingId?.type === "document" && draggingId.id === doc.id;
    const dropPos = dragOverId?.id === doc.id && dragItemRef.current?.type === "document" ? dragOverId.pos : null;

    return (
      <div key={doc.id}>
        <div
          className={`${css.leafRow}${active ? " " + css.active : ""}${isDragging ? " " + css.dragging : ""}${dropPos === "before" ? " " + css.dropBefore : ""}${dropPos === "after" ? " " + css.dropAfter : ""}`}
          style={{ paddingLeft: `${indent}px` }}
          data-drag-type="document"
          data-drag-id={doc.id}
          draggable={!isTouch}
          onPointerDown={(e) => startTouchDrag(e, { type: "document", id: doc.id, scope: doc.folder_id })}
          onContextMenu={isTouch ? (e) => e.preventDefault() : undefined}
          onDragStart={(e) => {
            e.stopPropagation();
            dragItemRef.current = { type: "document", id: doc.id, scope: doc.folder_id };
            setDraggingId({ type: "document", id: doc.id });
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (dragItemRef.current?.type !== "document" || dragItemRef.current.scope !== doc.folder_id) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            setDragOverId((prev) => prev?.id === doc.id && prev.pos === pos ? prev : { id: doc.id, pos });
          }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDocumentDrop(doc); }}
          onDragEnd={() => { dragItemRef.current = null; setDraggingId(null); setDragOverId(null); }}
          onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } navigate(`/documents/${doc.id}`); }}
        >
          {hasChildren
            ? <span onClick={toggleDoc}><ChevronIcon open={isOpen} /></span>
            : <span style={{ width: 14, display: "inline-block" }} />}
          <DocIcon />
          <span className={css.rowLabel}>{doc.name}</span>
          <div className={css.rowActions} onClick={stop}>
            <button className={css.iconBtn} title="Rename" onClick={() => renameDocument(doc)}><RenameIcon /></button>
            <button className={css.iconBtn} title="Delete" onClick={() => deleteDocument(doc)}>✕</button>
          </div>
        </div>
        {hasChildren && isOpen && (
          <>
            {toc.length > 0 && (() => {
              const tocOpen = expandedTocRoots.has(doc.id);
              return (
                <>
                  <div
                    className={css.leafRow}
                    style={{ paddingLeft: `${indent + 28}px` }}
                    onClick={() => setExpandedTocRoots((s) => { const n = new Set(s); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; })}
                  >
                    <span><ChevronIcon open={tocOpen} /></span>
                    <TocIcon />
                    <span className={css.rowLabel}>Contents</span>
                  </div>
                  {tocOpen && toc.map((entry, i) => renderTocEntry(entry, doc.id, indent + 44, String(i)))}
                </>
              );
            })()}
            {(linked.length > 0 || pages.length > 0) && (() => {
              const notesOpen = expandedNotesRoots.has(doc.id);
              return (
                <>
                  <div
                    className={css.leafRow}
                    style={{ paddingLeft: `${indent + 28}px` }}
                    onClick={() => setExpandedNotesRoots((s) => { const n = new Set(s); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; })}
                  >
                    <span><ChevronIcon open={notesOpen} /></span>
                    <NoteIcon />
                    <span className={css.rowLabel}>Notes</span>
                  </div>
                  {notesOpen && (
                    <>
                      {linked.map((n) => {
                        const pg = data.docNotePageNums[doc.id]?.[n.id];
                        return renderNote(
                          n,
                          indent + 44,
                          pg !== undefined ? `Page ${pg} – ` : undefined,
                          pg !== undefined ? { docId: doc.id, page: pg } : undefined,
                        );
                      })}
                      {pages.map((pageNum) => (
                        <div
                          key={`page-${pageNum}`}
                          className={css.leafRow}
                          style={{ paddingLeft: `${indent + 44}px` }}
                          onClick={() => navigate(`/documents/${doc.id}?page=${pageNum}`)}
                        >
                          <AnnotatedPageIcon />
                          <span className={css.rowLabel}>Page {pageNum} – Annotation</span>
                          <div className={css.rowActions} onClick={stop}>
                            <button className={css.iconBtn} title="Delete strokes" onClick={() => deleteAnnotatedPage(doc.id, pageNum)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  const linkedNoteIds = new Set(Object.values(data.docNotes).flat().map((n) => n.id));

  const renderFolder = (folder: Folder, indent: number): JSX.Element => {
    const children = data.folders.filter((f) => f.parent_folder_id === folder.id);
    const folderNotes = data.notes.filter((n) => n.folder_id === folder.id && !linkedNoteIds.has(n.id));
    const folderDocs = data.documents.filter((d) => d.folder_id === folder.id);
    const isOpen = expandedFolders.has(folder.id);
    const active = location.pathname === `/folders/${folder.id}`;

    const isDragging = draggingId?.type === "folder" && draggingId.id === folder.id;
    const dropPos = dragOverId?.id === folder.id && dragItemRef.current?.type === "folder" ? dragOverId.pos : null;

    return (
      <div key={folder.id}>
        <div
          className={`${css.folderRow}${active ? " " + css.active : ""}${isDragging ? " " + css.dragging : ""}${dropPos === "before" ? " " + css.dropBefore : ""}${dropPos === "after" ? " " + css.dropAfter : ""}`}
          style={{ paddingLeft: `${indent}px` }}
          data-drag-type="folder"
          data-drag-id={folder.id}
          draggable={!isTouch}
          onPointerDown={(e) => startTouchDrag(e, { type: "folder", id: folder.id, scope: folder.parent_folder_id })}
          onContextMenu={isTouch ? (e) => e.preventDefault() : undefined}
          onDragStart={(e) => {
            e.stopPropagation();
            dragItemRef.current = { type: "folder", id: folder.id, scope: folder.parent_folder_id };
            setDraggingId({ type: "folder", id: folder.id });
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (dragItemRef.current?.type !== "folder" || dragItemRef.current.scope !== folder.parent_folder_id) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            setDragOverId((prev) => prev?.id === folder.id && prev.pos === pos ? prev : { id: folder.id, pos });
          }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFolderDrop(folder); }}
          onDragEnd={() => { dragItemRef.current = null; setDraggingId(null); setDragOverId(null); }}
          onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } navigate(`/folders/${folder.id}`); }}
        >
          <span onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <ChevronIcon open={isOpen} />
          </span>
          <span className={css.rowLabel}>{folder.name}</span>
          <div className={css.rowActions} onClick={stop}>
            <button className={css.iconBtn} title="New note" onClick={() => createNote(folder.id)}><NewNoteIcon /></button>
            <button className={css.iconBtn} title="New subfolder" onClick={() => createFolder(folder.id)}><NewFolderIcon /></button>
            <button className={css.iconBtn} title="Upload document" onClick={() => uploadDocument(folder.id)}><UploadIcon /></button>
            <button className={css.iconBtn} title="Rename" onClick={() => renameFolder(folder)}><RenameIcon /></button>
            <button className={css.iconBtn} title="Delete" onClick={() => deleteFolder(folder)}>✕</button>
          </div>
        </div>

        {isOpen && (
          <>
            {children.map((child) => renderFolder(child, indent + 16))}
            {folderNotes.map((note) => renderNote(note, indent + 16))}
            {folderDocs.map((doc) => renderDocument(doc, indent + 16))}
            {children.length === 0 && folderNotes.length === 0 && folderDocs.length === 0 && (
              <div style={{ paddingLeft: `${indent + 16}px`, padding: "4px 8px 4px " + (indent + 16) + "px", fontSize: 12, color: "var(--text-ghost)" }}>
                Empty folder
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const rootFolders = data.folders.filter((f) => f.parent_folder_id === null);
  const rootNotes = data.notes.filter((n) => n.folder_id === null && !linkedNoteIds.has(n.id));
  const rootDocs = data.documents.filter((d) => d.folder_id === null);
  const isEmpty = rootFolders.length === 0 && rootNotes.length === 0 && rootDocs.length === 0;

  return (
    <nav className={`${css.sidebar}${className ? " " + className : ""}`} style={style}>
      <div className={css.toolbar}>
        <button className={css.toolbarBtn} title="New note" onClick={() => createNote()}>
          <NewNoteIcon />
        </button>
        <button className={css.toolbarBtn} title="New folder" onClick={() => createFolder()}>
          <NewFolderIcon />
        </button>
        <button className={css.toolbarBtn} title="Upload document" onClick={() => uploadDocument()}>
          <UploadIcon />
        </button>
        <div className={css.toolbarDivider} />
        <button
          className={`${css.toolbarBtn}${isTouch ? " " + css.toolbarBtnActive : ""}`}
          title={isTouch ? "Switch to desktop mode" : "Switch to touch mode"}
          onClick={toggleTouchMode}
        >
          <TouchModeIcon />
        </button>
        <button
          className={css.toolbarBtn}
          title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? (
            <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className={css.typeIcon} viewBox="0 0 16 16" fill="none">
              <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 100 11 5.5 5.5 0 007-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <div className={css.toolbarSpacer} />
        <button
          className={`${css.toolbarBtn}${location.pathname === "/settings" ? " " + css.toolbarBtnActive : ""}`}
          title="Settings"
          onClick={() => navigate("/settings")}
        >
          <SettingsIcon />
        </button>
      </div>

      <div className={`${css.tree}${draggingId ? " " + css.dragLock : ""}`}>
        {isEmpty && (
          <div className={css.emptyState}>
            No folders yet.<br />Click + to create one.
          </div>
        )}

        {rootFolders.map((folder) => renderFolder(folder, 8))}
        {rootNotes.map((note) => renderNote(note, 8))}
        {rootDocs.map((doc) => renderDocument(doc, 8))}
      </div>

      {mergingNote && (
        <MergeModal sourceNoteId={mergingNote.id} onClose={() => setMergingNote(null)} />
      )}
      {uploadModal && (
        <UploadDocumentModal
          folderId={uploadModal.folderId}
          onClose={() => setUploadModal(null)}
          onUploaded={(doc) => {
            setData((d) => ({ ...d, documents: [...d.documents, doc] }));
            setUploadModal(null);
            navigate(`/documents/${doc.id}`);
          }}
        />
      )}
    </nav>
  );
}
