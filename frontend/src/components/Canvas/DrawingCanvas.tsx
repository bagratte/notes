import { useState, useRef, useCallback } from "react";
import { getStroke } from "perfect-freehand";
import type { StrokeData } from "./types";
import { svgPathFromStroke } from "./utils";

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  eraserMode?: boolean;
  color?: string;
  penWidth?: number;
  readonly?: boolean;
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  inputEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};

function renderPath(
  points: [number, number, number][],
  color: string,
  width: number,
  key: string | number,
  strokeId?: number
) {
  const outline = getStroke(points, { ...STROKE_OPTIONS, size: width });
  const d = svgPathFromStroke(outline);
  return <path key={key} d={d} fill={color} data-stroke-id={strokeId} />;
}

export default function DrawingCanvas({
  strokes,
  onStrokeComplete,
  onEraseStroke,
  eraserMode = false,
  color = "#000000",
  penWidth = 3,
  readonly = false,
  width = "100%",
  height = 300,
  viewBox,
  inputEnabled = true,
  className,
  style,
}: Props) {
  const [livePoints, setLivePoints] = useState<[number, number, number][]>([]);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const erasedIds = useRef(new Set<number>());

  // Maps a pointer event's client coordinates into the SVG's own coordinate
  // space, respecting any viewBox transformation that may be in effect.
  const toSvgPoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb && vb.width > 0 ? vb.width / rect.width : 1;
      const scaleY = vb && vb.height > 0 ? vb.height / rect.height : 1;
      return [
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY,
        e.pressure > 0 ? e.pressure : 0.5,
      ];
    },
    []
  );

  const eraseAtPoint = useCallback(
    (e: React.PointerEvent) => {
      const samples: [number, number][] = [
        [e.clientX, e.clientY],
        [e.clientX + 8, e.clientY], [e.clientX - 8, e.clientY],
        [e.clientX, e.clientY + 8], [e.clientX, e.clientY - 8],
      ];
      for (const [cx, cy] of samples) {
        for (const el of document.elementsFromPoint(cx, cy)) {
          if (!(el instanceof SVGPathElement)) continue;
          const idStr = el.dataset.strokeId;
          if (!idStr) continue;
          const id = parseInt(idStr);
          if (erasedIds.current.has(id)) continue;
          erasedIds.current.add(id);
          onEraseStroke?.(id);
        }
      }
    },
    [onEraseStroke]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (readonly || !inputEnabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      if (eraserMode) {
        erasedIds.current.clear();
        eraseAtPoint(e);
      } else {
        setLivePoints([toSvgPoint(e)]);
      }
    },
    [readonly, inputEnabled, eraserMode, toSvgPoint, eraseAtPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      if (eraserMode) {
        eraseAtPoint(e);
      } else {
        setLivePoints((prev) => [...prev, toSvgPoint(e)]);
      }
    },
    [eraserMode, toSvgPoint, eraseAtPoint]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    if (eraserMode) return;
    setLivePoints((prev) => {
      if (prev.length > 0 && onStrokeComplete) {
        onStrokeComplete({ points: prev, color, width: penWidth });
      }
      return [];
    });
  }, [eraserMode, onStrokeComplete, color, penWidth]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={viewBox}
      className={className}
      style={{
        touchAction: inputEnabled ? "none" : "auto",
        pointerEvents: inputEnabled ? "all" : "none",
        cursor: eraserMode ? "cell" : "default",
        display: "block",
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {strokes.map((s, i) => renderPath(s.points, s.color, s.width, i, s.id))}
      {livePoints.length > 0 && renderPath(livePoints, color, penWidth, "live")}
    </svg>
  );
}
