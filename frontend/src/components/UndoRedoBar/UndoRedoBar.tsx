import { useState } from "react";
import css from "./UndoRedoBar.module.css";

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Phones: a single button opens a popup holding both undo and redo.
  collapsed?: boolean;
}

export default function UndoRedoBar({ canUndo, canRedo, onUndo, onRedo, collapsed = false }: Props) {
  const [open, setOpen] = useState(false);

  const buttons = (
    <>
      <button
        className={css.btn}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        className={css.btn}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↪
      </button>
    </>
  );

  if (!collapsed) return <div className={css.bar}>{buttons}</div>;

  return (
    <div className={css.anchor}>
      {open && <div className={css.backdrop} onPointerDown={() => setOpen(false)} />}
      <button
        className={`${css.btn}${open ? " " + css.active : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={!canUndo && !canRedo}
        title="Undo / redo"
      >
        ↩
      </button>
      {open && <div className={css.popover}>{buttons}</div>}
    </div>
  );
}
