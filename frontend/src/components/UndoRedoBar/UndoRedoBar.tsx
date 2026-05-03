import css from "./UndoRedoBar.module.css";

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function UndoRedoBar({ canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <div className={css.bar}>
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
    </div>
  );
}
