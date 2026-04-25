import css from "./PenToolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export const DEFAULT_PEN: PenSettings = { color: "#2255cc", width: 2 };

const WIDTHS = [
  { value: 2, label: "Thin" },
  { value: 5, label: "Wide" },
];

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
  eraserMode?: "stroke" | null;
  onEraserChange?: (mode: "stroke" | null) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function PenToolbar({
  settings,
  onChange,
  eraserMode,
  onEraserChange,
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

      <div className={css.sep} />
      {WIDTHS.map(({ value, label }) => (
        <button
          key={value}
          className={`${css.widthBtn}${settings.width === value ? " " + css.active : ""}`}
          title={label}
          onClick={() => onChange({ ...settings, width: value })}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r={value} fill="currentColor"/>
          </svg>
        </button>
      ))}

      {onEraserChange !== undefined && (
        <>
          <div className={css.sep} />
          <button
            className={`${css.widthBtn}${eraserMode === "stroke" ? " " + css.active : ""}`}
            title="Stroke eraser"
            onClick={() => onEraserChange(eraserMode === "stroke" ? null : "stroke")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 12H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M2 9l3-6 6 2-3 6H2z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M5 12l-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </>
      )}

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
