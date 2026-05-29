import { useEffect, useRef, useState } from "react";
import type { Document } from "@/types";
import { documents as docsApi } from "@/api";

interface Props {
  folderId?: number;
  onClose: () => void;
  onUploaded: (doc: Document) => void;
}

export default function UploadDocumentModal({ folderId, onClose, onUploaded }: Props) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleBrowse = () => {
    const picker = Object.assign(document.createElement("input"), {
      type: "file",
      accept: ".pdf,.djvu",
    });
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const name = window.prompt("Document name:", file.name) ?? file.name;
      if (!name.trim()) return;
      const doc = await docsApi.upload(name.trim(), file, folderId);
      onClose();
      onUploaded(doc);
    };
    picker.click();
  };

  const handleUploadFromUrl = async () => {
    if (!url.trim()) return;
    let defaultName = "";
    try { defaultName = new URL(url).pathname.split("/").pop() || ""; } catch { /* ignore */ }
    const name = window.prompt("Document name:", defaultName) ?? defaultName;
    if (!name.trim()) return;
    const doc = await docsApi.uploadFromUrl(name.trim(), url.trim(), folderId);
    onClose();
    onUploaded(doc);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={header}>Add Document</div>
        <div style={body}>
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleUploadFromUrl(); }}
            placeholder="https://…"
            style={urlInput}
          />
          <div style={orDivider}>
            <span style={orLine} />
            <span style={orLabel}>or</span>
            <span style={orLine} />
          </div>
          <button onClick={handleBrowse} style={browseBtn}>Browse file…</button>
        </div>
        <div style={footer}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button
            onClick={handleUploadFromUrl}
            disabled={!url.trim()}
            style={{ ...uploadBtn, opacity: url.trim() ? 1 : 0.4 }}
          >
            Upload from URL
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 100,
};

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: 8,
  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  width: 380,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid var(--border-card)",
};

const header: React.CSSProperties = {
  padding: "16px 20px 12px",
  fontSize: 15,
  fontWeight: 600,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border-faint)",
};

const body: React.CSSProperties = {
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const urlInput: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 5,
  fontSize: 13,
  outline: "none",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  width: "100%",
  boxSizing: "border-box",
};

const orDivider: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const orLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--border-faint)",
};

const orLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
};

const browseBtn: React.CSSProperties = {
  padding: "7px 14px",
  border: "1px solid var(--border)",
  borderRadius: 5,
  background: "var(--bg-card)",
  fontSize: 13,
  cursor: "pointer",
  color: "var(--text-secondary)",
  alignSelf: "flex-start",
};

const footer: React.CSSProperties = {
  padding: "10px 20px",
  borderTop: "1px solid var(--border-faint)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const cancelBtn: React.CSSProperties = {
  padding: "6px 14px",
  border: "1px solid var(--border)",
  borderRadius: 5,
  background: "var(--bg-card)",
  fontSize: 13,
  cursor: "pointer",
  color: "var(--text-muted)",
};

const uploadBtn: React.CSSProperties = {
  padding: "6px 14px",
  border: "none",
  borderRadius: 5,
  background: "var(--accent, #5b6af0)",
  fontSize: 13,
  cursor: "pointer",
  color: "#fff",
};
