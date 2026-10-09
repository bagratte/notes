import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { documents as docsApi } from "@/api";
import { PdfViewer, DjvuViewer } from "@/components/DocumentViewer";
import { PageHeader, RenameIcon, DeleteIcon, actionBtn } from "@/components/PageHeader";
import type { Document } from "@/types";
import { useImmersive } from "@/hooks/useImmersive";

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageFromUrl = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const overlayEnabled = searchParams.get("canvas") !== "false";
  const [doc, setDoc] = useState<Document | null>(null);
  const [missing, setMissing] = useState(false);
  const { immersive, enter: enterImmersive, exit: exitImmersive } = useImmersive();

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
      <div className="immersive-hide">
        <PageHeader
          title={doc.name}
          actions={
            <>
              <button onClick={enterImmersive} style={actionBtn} title="Full screen" aria-label="Full screen"><FullscreenIcon /></button>
              <button onClick={renameDocument} style={actionBtn}><RenameIcon /> Rename</button>
              <button onClick={deleteDocument} style={actionBtn}><DeleteIcon /> Delete</button>
            </>
          }
        />
      </div>
      {immersive && (
        <button onClick={exitImmersive} style={styles.exitBtn} title="Exit full screen" aria-label="Exit full screen">
          <ExitFullscreenIcon />
        </button>
      )}
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

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  exitBtn: {
    position: "fixed" as const,
    top: 12,
    right: 12,
    zIndex: 50,
    width: 44,
    height: 44,
    border: "none",
    borderRadius: 10,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
    opacity: 0.45,
    cursor: "pointer",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 0,
    boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
  },
  centered: {
    height: "100%",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
