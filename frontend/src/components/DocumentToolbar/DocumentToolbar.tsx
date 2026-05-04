import type { ToolMode, ActiveLayer } from "@/types";
import css from "./DocumentToolbar.module.css";

function SelectRegionIcon() {
  return (
    <path d="M1 5V2a1 1 0 0 1 1-1h3M9 1h3a1 1 0 0 1 1 1v3M13 9v3a1 1 0 0 1-1 1H9M5 13H2a1 1 0 0 1-1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  );
}

interface Props {
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  activeLayer: ActiveLayer;
  onActiveLayerChange: (l: ActiveLayer) => void;
}

export default function DocumentToolbar({ tool, onToolChange, activeLayer, onActiveLayerChange }: Props) {
  return (
    <div className={`${css.toolbar}${activeLayer !== "document" ? " " + css.inactive : ""}`}>
      <button
        className={`${css.toolBtn}${activeLayer === "document" ? " " + css.active : ""}`}
        title="Capture input"
        onClick={() => onActiveLayerChange(activeLayer === "document" ? null : "document")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          {activeLayer === "document" && <circle cx="7" cy="7" r="2.5" fill="currentColor"/>}
        </svg>
      </button>
      <button
        className={`${css.toolBtn}${tool === "select-region" ? " " + css.active : ""}`}
        title="Select region"
        onClick={() => onToolChange("select-region")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <SelectRegionIcon />
        </svg>
      </button>
    </div>
  );
}
