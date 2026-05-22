import type { ReactElement } from "react";
import type { ToolMode } from "@/types";
import css from "./Toolbar.module.css";

export interface PenSettings {
  color: string;
  width: number;
}

export const DEFAULT_PEN: PenSettings = { color: "#2255cc", width: 4 };
export const DEFAULT_PEN_DOCUMENT: PenSettings = { color: "#2255cc", width: 2 };

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

const TOOL_TITLES: Record<ToolMode, string> = {
  auto: "Auto — stylus draws, finger scrolls",
  hand: "Hand / Pan",
  pen: "Pen",
  "stroke-eraser": "Stroke eraser",
  "segment-eraser": "Precision eraser",
  "select-region": "Select region",
  "text-select": "Select text",
};

function AutoIcon() {
  return (
    <text x="7" y="11" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" fontFamily="system-ui,-apple-system,sans-serif">A</text>
  );
}

function HandIcon() {
  return (
    <>
      <path d="M5.2 6.2V3.7a1 1 0 0 1 2 0v1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M7.2 5.2V3a1 1 0 1 1 2 0v2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M9.2 5.8V3.8a1 1 0 1 1 2 0v4.1c0 2.3-1.7 4.1-3.9 4.1H6.7c-1.8 0-3.2-1.4-3.2-3.2V6.7a1 1 0 1 1 2 0v1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  );
}

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

function SelectRegionIcon() {
  return (
    <path d="M1 5V2a1 1 0 0 1 1-1h3M9 1h3a1 1 0 0 1 1 1v3M13 9v3a1 1 0 0 1-1 1H9M5 13H2a1 1 0 0 1-1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  );
}

function TextSelectIcon() {
  return (
    <>
      <path d="M4 2h6M7 2v10M4 12h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 5v4M11 5v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1 1.5"/>
    </>
  );
}

const TOOL_ICONS: Record<ToolMode, () => ReactElement> = {
  auto: AutoIcon,
  hand: HandIcon,
  pen: PenIcon,
  "stroke-eraser": StrokeEraserIcon,
  "segment-eraser": SegmentEraserIcon,
  "select-region": SelectRegionIcon,
  "text-select": TextSelectIcon,
};

interface Props {
  settings: PenSettings;
  onChange: (s: PenSettings) => void;
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  availableTools: ToolMode[];
  activeOverride?: "stroke-eraser" | "segment-eraser" | null;
}

export default function Toolbar({
  settings,
  onChange,
  tool,
  onToolChange,
  availableTools,
  activeOverride = null,
}: Props) {
  const showPenSettings = availableTools.includes("pen");

  return (
    <div className={css.toolbar}>
      {availableTools.map((t) => {
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

      {showPenSettings && (
        <>
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
        </>
      )}
    </div>
  );
}
