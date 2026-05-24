import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { documents as docsApi } from "@/api";
import { PdfViewer, DjvuViewer } from "@/components/DocumentViewer";
import { PageHeader, RenameIcon, DeleteIcon, actionBtn } from "@/components/PageHeader";
import type { Document } from "@/types";

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageFromUrl = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const overlayEnabled = searchParams.get("canvas") !== "false";
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
        <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Document not found.</span>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={styles.centered}>
        <span style={{ color: "var(--text-ghost)", fontSize: 14 }}>Loading…</span>
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
      <PageHeader
        title={doc.name}
        actions={
          <>
            <button onClick={renameDocument} style={actionBtn}><RenameIcon /> Rename</button>
            <button onClick={deleteDocument} style={actionBtn}><DeleteIcon /> Delete</button>
          </>
        }
      />
      <div style={styles.viewerWrap}>
        {doc.type === "pdf" ? (
          <PdfViewer
            url={docsApi.fileUrl(doc.id)}
            documentId={doc.id}
            folderId={doc.folder_id ?? undefined}
            initialPage={pageFromUrl ?? doc.last_page ?? undefined}
            overlayEnabled={overlayEnabled}
            serverLastPage={doc.last_page}
            serverLastPageUpdatedAt={doc.last_page_updated_at}
          />
        ) : (
          <DjvuViewer
            url={docsApi.fileUrl(doc.id)}
            documentId={doc.id}
            folderId={doc.folder_id ?? undefined}
            initialPage={pageFromUrl ?? doc.last_page ?? undefined}
            overlayEnabled={overlayEnabled}
            serverLastPage={doc.last_page}
            serverLastPageUpdatedAt={doc.last_page_updated_at}
          />
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
