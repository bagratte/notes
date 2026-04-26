import css from "./PenToolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export type PenToolbarMode = "hand" | "annotate" | "stroke-eraser" | "region";

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
  mode: PenToolbarMode;
  onModeChange?: (mode: PenToolbarMode) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function PenToolbar({
  settings,
  onChange,
  mode,
  onModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const showUndoRedo = onUndo !== undefined || onRedo !== undefined;

  return (
    <div className={css.toolbar}>
      <button
        className={`${css.widthBtn}${mode === "hand" ? " " + css.active : ""}`}
        title="Scroll"
        onClick={() => onModeChange?.("hand")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5.2 6.2V3.7a1 1 0 0 1 2 0v1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M7.2 5.2V3a1 1 0 1 1 2 0v2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M9.2 5.8V3.8a1 1 0 1 1 2 0v4.1c0 2.3-1.7 4.1-3.9 4.1H6.7c-1.8 0-3.2-1.4-3.2-3.2V6.7a1 1 0 1 1 2 0v1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className={css.sep} />

      {COLORS.map(({ value, label }) => (
        <button
          key={value}
          className={`${css.colorBtn}${mode === "annotate" && settings.color === value ? " " + css.active : ""}`}
          style={{ background: value }}
          title={label}
          onClick={() => {
            onChange({ ...settings, color: value });
            onModeChange?.("annotate");
          }}
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

      {onModeChange !== undefined && (
        <>
          <div className={css.sep} />
          <button
            className={`${css.widthBtn}${mode === "stroke-eraser" ? " " + css.active : ""}`}
            title="Stroke eraser"
            onClick={() => onModeChange(mode === "stroke-eraser" ? "annotate" : "stroke-eraser")}
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
