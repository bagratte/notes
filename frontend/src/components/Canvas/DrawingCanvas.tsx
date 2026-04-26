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

function normalizePressure(e: React.PointerEvent): number {
  if (e.pointerType === "pen") {
    if (e.pressure > 0) return Math.min(1, Math.max(0.12, e.pressure));
    return 0.2;
  }
  return e.pressure > 0 ? e.pressure : 0.5;
}

function appendPoint(
  prev: [number, number, number][],
  next: [number, number, number],
  pointerType: string
): [number, number, number][] {
  if (pointerType !== "pen" || prev.length === 0) {
    return [...prev, next];
  }

  const last = prev[prev.length - 1];
  const alphaPos = 0.45;
  const alphaPressure = 0.6;
  const smoothed: [number, number, number] = [
    last[0] + (next[0] - last[0]) * alphaPos,
    last[1] + (next[1] - last[1]) * alphaPos,
    last[2] + (next[2] - last[2]) * alphaPressure,
  ];
  return [...prev, smoothed];
}

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
  const [activePointerType, setActivePointerType] = useState<string | null>(null);
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
        normalizePressure(e),
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
      setActivePointerType(e.pointerType);
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
      if (activePointerType !== e.pointerType) {
        setActivePointerType(e.pointerType);
      }
      if (!drawing.current) return;
      e.preventDefault();
      if (eraserMode) {
        eraseAtPoint(e);
      } else {
        setLivePoints((prev) => appendPoint(prev, toSvgPoint(e), e.pointerType));
      }
    },
    [eraserMode, toSvgPoint, eraseAtPoint, activePointerType]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setActivePointerType(e.pointerType);
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

  const handlePointerLeave = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    handlePointerUp(e);
    setActivePointerType(null);
  }, [handlePointerUp]);

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
        cursor: !inputEnabled ? "grab" : eraserMode ? "cell" : activePointerType === "pen" ? "none" : "default",
        display: "block",
        ...style,
      }}
      onPointerEnter={(e) => setActivePointerType(e.pointerType)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {strokes.map((s, i) => renderPath(s.points, s.color, s.width, i, s.id))}
      {livePoints.length > 0 && renderPath(livePoints, color, penWidth, "live")}
    </svg>
  );
}
