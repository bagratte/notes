import { useState, useRef, useCallback } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import type { StrokeData } from "@/components/Canvas";
import type { Region } from "@/types";

export interface EnrichedRegion extends Region {
  note_id: number;
}

export type ToolMode = "view" | "annotate" | "region";

interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NaturalSize {
  width: number;
  height: number;
}

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (s: StrokeData) => void;
  regions: EnrichedRegion[];
  onRegionComplete?: (rect: DragRect) => void;
  onRegionClick?: (region: EnrichedRegion) => void;
  activeSectionId?: number | null;
  mode: ToolMode;
  viewBox?: string;
  naturalSize?: NaturalSize;
  color?: string;
  penWidth?: number;
  className?: string;
}

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};

const MIN_REGION_PX = 10;

function renderStrokePath(
  points: [number, number, number][],
  color: string,
  width: number,
  key: string | number
) {
  const outline = getStroke(points, { ...STROKE_OPTIONS, size: width });
  const d = svgPathFromStroke(outline);
  return <path key={key} d={d} fill={color} />;
}

export default function DocumentOverlay({
  strokes,
  onStrokeComplete,
  regions,
  onRegionComplete,
  onRegionClick,
  activeSectionId,
  mode,
  viewBox,
  naturalSize,
  color = "#000000",
  penWidth = 3,
  className,
}: Props) {
  const [livePoints, setLivePoints] = useState<[number, number, number][]>([]);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const toSvgPoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width > 0 ? vb.width / rect.width : 1;
      const scaleY = vb.height > 0 ? vb.height / rect.height : 1;
      return [
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY,
        e.pressure > 0 ? e.pressure : 0.5,
      ];
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (mode === "view") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = toSvgPoint(e);
      drawing.current = true;
      if (mode === "annotate") {
        setLivePoints([pt]);
      } else {
        setDragStart([pt[0], pt[1]]);
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const pt = toSvgPoint(e);
      if (mode === "annotate") {
        setLivePoints((prev) => [...prev, pt]);
      } else {
        setDragCurrent([pt[0], pt[1]]);
      }
    },
    [mode, toSvgPoint]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;

    if (mode === "annotate") {
      setLivePoints((prev) => {
        if (prev.length > 0 && onStrokeComplete) {
          onStrokeComplete({ points: prev, color, width: penWidth });
        }
        return [];
      });
    } else if (mode === "region") {
      setDragStart((start) => {
        setDragCurrent((current) => {
          if (start && current && onRegionComplete) {
            const x = Math.min(start[0], current[0]);
            const y = Math.min(start[1], current[1]);
            const w = Math.abs(current[0] - start[0]);
            const h = Math.abs(current[1] - start[1]);
            if (w > MIN_REGION_PX && h > MIN_REGION_PX) {
              onRegionComplete({ x, y, width: w, height: h });
            }
          }
          return null;
        });
        return null;
      });
    }
  }, [mode, onStrokeComplete, onRegionComplete, color, penWidth]);

  const dragRect: DragRect | null =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart[0], dragCurrent[0]),
          y: Math.min(dragStart[1], dragCurrent[1]),
          width: Math.abs(dragCurrent[0] - dragStart[0]),
          height: Math.abs(dragCurrent[1] - dragStart[1]),
        }
      : null;

  const active = mode !== "view";

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {/* Region boxes — clickable divs so they work independently of SVG pointer-events */}
      {naturalSize &&
        regions.map((r) => {
          const isActive = activeSectionId != null && r.section_id === activeSectionId;
          return (
            <div
              key={r.id}
              onClick={mode === "view" ? () => onRegionClick?.(r) : undefined}
              title={mode === "view" ? "Open linked note" : undefined}
              style={{
                position: "absolute",
                left: `${(r.x / naturalSize.width) * 100}%`,
                top: `${(r.y / naturalSize.height) * 100}%`,
                width: `${(r.width / naturalSize.width) * 100}%`,
                height: `${(r.height / naturalSize.height) * 100}%`,
                background: isActive
                  ? "rgba(74, 108, 247, 0.22)"
                  : "rgba(74, 108, 247, 0.1)",
                border: isActive
                  ? "2px solid rgba(74, 108, 247, 0.9)"
                  : "1.5px solid rgba(74, 108, 247, 0.55)",
                borderRadius: 2,
                boxSizing: "border-box",
                cursor: mode === "view" ? "pointer" : "default",
                pointerEvents: mode === "view" ? "auto" : "none",
                transition: "background 0.15s, border 0.15s",
              }}
            />
          );
        })}

      {/* Drawing SVG — strokes + region drag rectangle */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: active ? "none" : "auto",
          pointerEvents: active ? "all" : "none",
          cursor: mode === "region" ? "crosshair" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {strokes.map((s, i) =>
          renderStrokePath(s.points, s.color, s.width, i)
        )}
        {livePoints.length > 0 &&
          renderStrokePath(livePoints, color, penWidth, "live")}

        {dragRect && (
          <rect
            x={dragRect.x}
            y={dragRect.y}
            width={dragRect.width}
            height={dragRect.height}
            fill="rgba(74, 108, 247, 0.08)"
            stroke="rgba(74, 108, 247, 0.7)"
            strokeWidth={1}
            strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}
