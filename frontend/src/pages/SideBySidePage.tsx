import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { documents as docsApi, notes as notesApi } from "@/api";
import { DocumentViewer, DjvuViewer } from "@/components/DocumentViewer";
import type { EnrichedRegion } from "@/components/DocumentViewer/DocumentOverlay";
import { NoteEditor } from "@/components/NoteEditor";
import MergeModal from "./MergeModal";
import type { Document, Note } from "@/types";

export default function SideBySidePage() {
  const { documentId, noteId } = useParams<{ documentId: string; noteId: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!documentId || !noteId) return;
    Promise.all([
      docsApi.get(Number(documentId)),
      notesApi.get(Number(noteId)),
    ]).then(([d, n]) => {
      setDoc(d);
      setNote(n);
    });
  }, [documentId, noteId]);

  const handleRegionClick = useCallback((region: EnrichedRegion) => {
    setActiveSectionId(region.section_id);
  }, []);

  if (!doc || !note) {
    return (
      <div style={styles.loading}>
        <span style={{ color: "#ccc", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      {/* ── Document pane ── */}
      <div style={styles.pane}>
        <div style={styles.paneHeader}>
          <span style={styles.paneTitle}>{doc.name}</span>
          <span style={styles.paneTag}>Document</span>
        </div>
        <div style={styles.paneBody}>
          {doc.type === "pdf" ? (
            <DocumentViewer
              url={docsApi.fileUrl(doc.id)}
              documentId={doc.id}
              folderId={doc.folder_id ?? undefined}
              activeSectionId={activeSectionId}
              onRegionClick={handleRegionClick}
            />
          ) : (
            <DjvuViewer
              url={docsApi.fileUrl(doc.id)}
              documentId={doc.id}
              folderId={doc.folder_id ?? undefined}
              activeSectionId={activeSectionId}
              onRegionClick={handleRegionClick}
            />
          )}
        </div>
      </div>

      <div style={styles.divider} />

      {/* ── Note pane ── */}
      <div style={styles.pane}>
        <div style={styles.paneHeader}>
          <span style={styles.paneTitle}>{note.name}</span>
          <button onClick={() => setMerging(true)} style={styles.mergeBtn}>Merge into…</button>
          <span style={styles.paneTag}>Note</span>
        </div>
        <div style={{ ...styles.paneBody, overflowY: "auto", background: "#f0ede8" }}>
          <div style={styles.noteBody}>
            <NoteEditor noteId={note.id} activeSectionId={activeSectionId} />
          </div>
        </div>
      </div>
      {merging && note && (
        <MergeModal sourceNoteId={note.id} onClose={() => setMerging(false)} />
      )}
    </div>
  );
}

const styles = {
  shell: {
    display: "flex" as const,
    height: "100vh",
    overflow: "hidden",
  },
  loading: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  pane: {
    flex: 1,
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden",
    minWidth: 0,
  },
  paneHeader: {
    padding: "10px 20px",
    borderBottom: "1px solid #e0ddd8",
    background: "#f8f6f2",
    flexShrink: 0,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  paneTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "#2a2a2a",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  mergeBtn: {
    padding: "3px 10px",
    fontSize: 11,
    border: "1px solid #ddd",
    borderRadius: 5,
    background: "#fff",
    cursor: "pointer",
    color: "#555",
    flexShrink: 0,
  },
  paneTag: {
    fontSize: 11,
    color: "#aaa",
    background: "#ede9e3",
    padding: "2px 7px",
    borderRadius: 10,
    flexShrink: 0,
  },
  paneBody: {
    flex: 1,
    overflow: "hidden",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  divider: {
    width: 1,
    background: "#dedad3",
    flexShrink: 0,
  },
  noteBody: {
    padding: "20px 28px",
    maxWidth: 760,
    margin: "0 auto",
    width: "100%",
  },
};
