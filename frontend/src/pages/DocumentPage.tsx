import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { documents as docsApi } from "@/api";
import { DocumentViewer, DjvuViewer } from "@/components/DocumentViewer";
import type { Document } from "@/types";

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
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

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>{doc.name}</h1>
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
