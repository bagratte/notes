import { type ReactElement, useState, useEffect } from "react";
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
  highlighter: "Highlighter",
  "stroke-eraser": "Stroke eraser",
  "segment-eraser": "Precision eraser",
  "select-region": "Select region",
  "text-select": "Select text",
  "stroke-select": "Select strokes",
};

const OVERFLOW_TOOLS = new Set<ToolMode>(["hand", "pen", "highlighter", "segment-eraser", "stroke-select"]);

function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 912px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 912px)");
    const handle = (e: MediaQueryListEvent) => setCompact(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);
  return compact;
}

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

function HighlighterIcon() {
  return (
    <>
      <rect x="3" y="3" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2"/>
      <path d="M5 8h4l-1 3H6L5 8z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.4"/>
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

function StrokeSelectIcon() {
  return (
    <>
      <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 1.5" fill="none"/>
      <path d="M9 9l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  );
}

function MoreIcon() {
  return (
    <>
      <circle cx="2.5" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="11.5" cy="7" r="1.2" fill="currentColor"/>
    </>
  );
}

const TOOL_ICONS: Record<ToolMode, () => ReactElement> = {
  auto: AutoIcon,
  hand: HandIcon,
  pen: PenIcon,
  highlighter: HighlighterIcon,
  "stroke-eraser": StrokeEraserIcon,
  "segment-eraser": SegmentEraserIcon,
  "select-region": SelectRegionIcon,
  "text-select": TextSelectIcon,
  "stroke-select": StrokeSelectIcon,
};

interface Props {
  settings: PenSettings;
  onChange: (s: PenSettings) => void;
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  availableTools: ToolMode[];
  activeOverride?: "stroke-eraser" | "segment-eraser" | null;
  disableCompact?: boolean;
}

export default function Toolbar({
  settings,
  onChange,
  tool,
  onToolChange,
  availableTools,
  activeOverride = null,
  disableCompact = false,
}: Props) {
  const compact = useCompact() && !disableCompact;
  const showPenSettings = availableTools.includes("pen") || availableTools.includes("highlighter");
  const [moreOpen, setMoreOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState(false);

  const primaryTools = compact
    ? availableTools.filter((t) => !OVERFLOW_TOOLS.has(t))
    : availableTools;
  const overflowTools = compact
    ? availableTools.filter((t) => OVERFLOW_TOOLS.has(t))
    : [];

  const overflowIsActive = overflowTools.includes(tool) && !activeOverride;
  const overflowHasOverride = activeOverride != null && OVERFLOW_TOOLS.has(activeOverride);

  function ToolBtn({ t, onSelect }: { t: ToolMode; onSelect?: () => void }) {
    const Icon = TOOL_ICONS[t];
    const isOverride = activeOverride === t;
    const isActive = tool === t && !activeOverride;
    return (
      <button
        className={`${css.toolBtn}${isActive ? " " + css.active : ""}${isOverride ? " " + css.override : ""}`}
        title={TOOL_TITLES[t]}
        onClick={() => { onToolChange(t); onSelect?.(); }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <Icon />
        </svg>
      </button>
    );
  }

  return (
    <div className={css.toolbar}>
      {primaryTools.map((t) => <ToolBtn key={t} t={t} />)}

      {compact && overflowTools.length > 0 && (
        <div className={css.popoverAnchor}>
          {moreOpen && (
            <div className={css.popoverBackdrop} onPointerDown={() => setMoreOpen(false)} />
          )}
          <button
            className={`${css.toolBtn}${overflowIsActive ? " " + css.active : ""}${overflowHasOverride ? " " + css.override : ""}`}
            title="More tools"
            onClick={() => { setMoreOpen((o) => !o); setColorOpen(false); setWidthOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <MoreIcon />
            </svg>
          </button>
          {moreOpen && (
            <div className={css.popover}>
              {overflowTools.map((t) => (
                <ToolBtn key={t} t={t} onSelect={() => setMoreOpen(false)} />
              ))}
            </div>
          )}
        </div>
      )}

      {showPenSettings && (
        <>
          <div className={css.sep} />

          {!compact && (
            <>
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

          {compact && (
            <>
              <div className={css.popoverAnchor}>
                {colorOpen && (
                  <div className={css.popoverBackdrop} onPointerDown={() => setColorOpen(false)} />
                )}
                <button
                  className={`${css.colorBtn} ${css.active}`}
                  style={{ background: settings.color }}
                  title="Pen color"
                  onClick={() => { setColorOpen((o) => !o); setWidthOpen(false); setMoreOpen(false); }}
                />
                {colorOpen && (
                  <div className={`${css.popover} ${css.colorPopover}`}>
                    {COLORS.map(({ value, label }) => (
                      <button
                        key={value}
                        className={`${css.colorBtn}${settings.color === value ? " " + css.active : ""}`}
                        style={{ background: value }}
                        title={label}
                        onClick={() => onChange({ ...settings, color: value })}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className={css.popoverAnchor}>
                {widthOpen && (
                  <div className={css.popoverBackdrop} onPointerDown={() => setWidthOpen(false)} />
                )}
                <button
                  className={`${css.toolBtn} ${css.active}`}
                  title="Pen width"
                  onClick={() => { setWidthOpen((o) => !o); setColorOpen(false); setMoreOpen(false); }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r={settings.width} fill="currentColor"/>
                  </svg>
                </button>
                {widthOpen && (
                  <div className={`${css.popover} ${css.widthPopover}`}>
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
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
