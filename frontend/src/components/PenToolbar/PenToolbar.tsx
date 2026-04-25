import css from "./PenToolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export const DEFAULT_PEN: PenSettings = { color: "#2255cc", width: 2 };

const COLORS = [
  { value: "#c0392b", label: "Red" },
  { value: "#e67e22", label: "Orange" },
  { value: "#f1c40f", label: "Yellow" },
  { value: "#1a6b2a", label: "Green" },
  { value: "#2255cc", label: "Blue" },
  { value: "#4b0082", label: "Indigo" },
  { value: "#8b00ff", label: "Violet" },
  { value: "#1a1a1a", label: "Black" },
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
