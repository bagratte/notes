import css from "./PenToolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export const DEFAULT_PEN: PenSettings = { color: "#1a1a1a", width: 2 };

const COLORS = [
  { value: "#1a1a1a", label: "Black" },
  { value: "#1a3a8c", label: "Blue" },
  { value: "#8c1a1a", label: "Red" },
  { value: "#1a6b2a", label: "Green" },
  { value: "#6b2d8b", label: "Purple" },
];



interface Props {
  settings: PenSettings;
  onChange: (s: PenSettings) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function PenToolbar({
  settings,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const showUndoRedo = onUndo !== undefined || onRedo !== undefined;

  return (
    <div className={css.toolbar}>
      {COLORS.map(({ value, label }) => (
        <button
          key={value}
          className={`${css.colorBtn}${settings.color === value ? " " + css.active : ""}`}
          style={{ background: value }}
          title={label}
          onClick={() => onChange({ ...settings, color: value })}
        />
      ))}

      {showUndoRedo && (
        <>
          <div className={css.sep} />
          <button
            className={css.undoBtn}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            className={css.undoBtn}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↪
          </button>
        </>
      )}
    </div>
  );
}
