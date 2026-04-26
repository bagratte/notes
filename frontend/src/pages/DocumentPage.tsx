import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { documents as docsApi } from "@/api";

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
import { DocumentViewer, DjvuViewer } from "@/components/DocumentViewer";
import type { Document } from "@/types";

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPage = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const [doc, setDoc] = useState<Document | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    setDoc(null);
    setMissing(false);
    docsApi.get(Number(documentId)).then(setDoc).catch(() => setMissing(true));
  }, [documentId]);

  if (missing) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "#aaa", fontSize: 14 }}>Document not found.</span>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "#ccc", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  const renameDocument = async () => {
    const name = window.prompt("Rename document:", doc.name);
    if (!name?.trim() || name === doc.name) return;
    const updated = await docsApi.update(doc.id, name.trim());
    setDoc(updated);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
  };

  const deleteDocument = async () => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    await docsApi.delete(doc.id);
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate("/");
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>{doc.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={renameDocument} style={styles.actionBtn}><RenameIcon /> Rename</button>
          <button onClick={deleteDocument} style={styles.actionBtn}><DeleteIcon /> Delete</button>
        </div>
      </div>
      <div style={styles.viewerWrap}>
        {doc.type === "pdf" ? (
          <DocumentViewer url={docsApi.fileUrl(doc.id)} documentId={doc.id} folderId={doc.folder_id ?? undefined} initialPage={initialPage} />
        ) : (
          <DjvuViewer url={docsApi.fileUrl(doc.id)} documentId={doc.id} folderId={doc.folder_id ?? undefined} initialPage={initialPage} />
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    height: "100vh",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  header: {
    height: 50,
    padding: "0 24px",
    borderBottom: "1px solid #e0ddd8",
    background: "#f8f6f2",
    flexShrink: 0,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: 500,
    color: "#2a2a2a",
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
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
  viewerWrap: {
    flex: 1,
    overflow: "hidden",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  centered: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
