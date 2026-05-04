import type { ToolMode, ActiveLayer } from "@/types";
import css from "./Toolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export const DEFAULT_PEN: PenSettings = { color: "#2255cc", width: 4 };

const WIDTHS = [
  { value: 2, label: "Thin" },
  { value: 4, label: "Medium" },
  { value: 6, label: "Wide" },
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

const CANVAS_TOOLS: ToolMode[] = ["pen", "stroke-eraser", "segment-eraser"];

const TOOL_TITLES: Record<string, string> = {
  pen: "Pen",
  "stroke-eraser": "Stroke eraser",
  "segment-eraser": "Precision eraser",
};

function PenIcon() {
  return (
    <>
      <path d="M10 2l2 2-7 7.5-2.5.5.5-2.5L10 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      <path d="M8.5 3.5l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </>
  );
}

function StrokeEraserIcon() {
  return (
    <>
      <path d="M5 12H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2 9l3-6 6 2-3 6H2z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 12l-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  );
}

function SegmentEraserIcon() {
  return (
    <>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </>
  );
}

const TOOL_ICONS: Record<string, () => JSX.Element> = {
  pen: PenIcon,
  "stroke-eraser": StrokeEraserIcon,
  "segment-eraser": SegmentEraserIcon,
};


interface Props {
  settings: PenSettings;
  onChange: (s: PenSettings) => void;
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  activeOverride?: "stroke-eraser" | "segment-eraser" | null;
  activeLayer: ActiveLayer;
  onActiveLayerChange: (l: ActiveLayer) => void;
}

export default function CanvasToolbar({
  settings,
  onChange,
  tool,
  onToolChange,
  activeOverride = null,
  activeLayer,
  onActiveLayerChange,
}: Props) {
  return (
    <div className={`${css.toolbar}${activeLayer !== "canvas" ? " " + css.inactive : ""}`}>
      <button
        className={`${css.toolBtn}${activeLayer === "canvas" ? " " + css.active : ""}`}
        title="Capture input"
        onClick={() => onActiveLayerChange(activeLayer === "canvas" ? null : "canvas")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          {activeLayer === "canvas" && <circle cx="7" cy="7" r="2.5" fill="currentColor"/>}
        </svg>
      </button>
      {CANVAS_TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t];
        const isOverride = activeOverride === t;
        const isActive = tool === t && !activeOverride;
        return (
          <button
            key={t}
            className={`${css.toolBtn}${isActive ? " " + css.active : ""}${isOverride ? " " + css.override : ""}`}
            title={TOOL_TITLES[t]}
            onClick={() => onToolChange(t)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <Icon />
            </svg>
          </button>
        );
      })}

      <div className={css.sep} />
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
          className={`${css.toolBtn}${settings.width === value ? " " + css.active : ""}`}
          title={label}
          onClick={() => onChange({ ...settings, width: value })}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r={value} fill="currentColor"/>
          </svg>
        </button>
      ))}
    </div>
  );
}
