import type { CSSProperties } from "react";

export const actionBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 11px",
  fontSize: 13,
  border: "1px solid var(--border)",
  borderRadius: 5,
  background: "var(--bg-card)",
  cursor: "pointer",
  color: "var(--text-muted)",
  flexShrink: 0,
};
