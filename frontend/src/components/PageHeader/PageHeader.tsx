import type { ReactNode } from "react";
import css from "./PageHeader.module.css";

export function RenameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 3h3M10.5 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  title: string;
  actions?: ReactNode;
  sticky?: boolean;
}

export default function PageHeader({ title, actions, sticky = false }: Props) {
  return (
    <div className={`${css.header}${sticky ? " " + css.sticky : ""}`}>
      <h1 className={css.title}>{title}</h1>
      {actions && <div className={css.actions}>{actions}</div>}
    </div>
  );
}
