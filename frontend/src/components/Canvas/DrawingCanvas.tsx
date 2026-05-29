import { useDrawing } from "./useDrawing";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke, flipLightness } from "./utils";
import type { StrokeData } from "./types";
import type { NaturalRect } from "./strokeSelectUtils";
import type { ToolMode } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";
import { useTheme } from "@/context/Theme";

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  onSegmentErase?: (deleted: number[], created: StrokeData[]) => void;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  onStrokeSelectStart?: (pt: [number, number]) => void;
  onStrokeSelectMove?: (pt: [number, number]) => void;
  onStrokeSelectEnd?: () => void;
  mode?: ToolMode;
  color?: string;
  penWidth?: number;
  readonly?: boolean;
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  inputEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  selectionDragRect?: NaturalRect | null;
  selectedStrokeIds?: Set<number> | null;
  strokeMoveOffset?: { dx: number; dy: number } | null;
}

export default function DrawingCanvas({
  strokes,
  onStrokeComplete,
  onEraseStroke,
  onSegmentErase,
  onHwOverrideChange,
  onStrokeSelectStart,
  onStrokeSelectMove,
  onStrokeSelectEnd,
  mode = "pen",
  color = "#000000",
  penWidth = 3,
  readonly = false,
  width = "100%",
  height = 300,
  viewBox,
  inputEnabled = true,
  className,
  style,
  selectionDragRect = null,
  selectedStrokeIds = null,
  strokeMoveOffset = null,
}: Props) {
  const { settings: ds } = useDrawingSettings();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const {
    svgRef,
    liveCanvasRef,
    activePointerType,
    erasePreview,
    eraserPos,
    effectiveModeRef,
    strokePathCache,
    svgHandlers,
  } = useDrawing({
    strokes,
    mode,
    color,
    penWidth,
    isDark,
    viewBox,
    inputEnabled,
    readonly,
    onStrokeComplete,
    onEraseStroke,
    onSegmentErase,
    onHwOverrideChange,
    onStrokeSelectStart,
    onStrokeSelectMove,
    onStrokeSelectEnd,
  });

  const hasSelection = selectedStrokeIds != null && selectedStrokeIds.size > 0;

  return (
    <div
      className={className}
      style={{ position: "relative", width, height, display: "block", ...style }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{
          touchAction: inputEnabled && mode !== "auto" ? "none" : "auto",
          pointerEvents: inputEnabled ? "all" : "none",
          cursor: !inputEnabled
            ? "grab"
            : effectiveModeRef.current === "stroke-eraser"
            ? "cell"
            : effectiveModeRef.current === "segment-eraser"
            ? "none"
            : effectiveModeRef.current === "stroke-select"
            ? "crosshair"
            : activePointerType === "pen"
            ? "none"
            : "default",
          display: "block",
        }}
        {...svgHandlers}
      >
        {(() => {
          const visible = strokes.filter(s => !erasePreview.has(s.id as number));
          const nonSelected = hasSelection ? visible.filter(s => s.id == null || !selectedStrokeIds!.has(s.id)) : visible;
          const selected    = hasSelection ? visible.filter(s => s.id != null && selectedStrokeIds!.has(s.id))  : [];

          function renderPath(s: StrokeData, i: number) {
            const cacheKey: number | StrokeData = s.id ?? s;
            const cached = strokePathCache.current.get(cacheKey);
            let d: string;
            if (cached && cached.points === s.points) {
              d = cached.d;
            } else {
              const isHighlighter = s.color.length === 9;
              const outline = getStroke(s.points, {
                thinning: isHighlighter ? 0 : ds.thinning,
                smoothing: ds.smoothing,
                streamline: ds.streamline,
                simulatePressure: isHighlighter ? false : ds.simulatePressure,
                size: s.width,
              });
              d = svgPathFromStroke(outline);
              strokePathCache.current.set(cacheKey, { points: s.points, d });
            }
            return <path key={s.id ?? i} d={d} fill={isDark ? flipLightness(s.color) : s.color} data-stroke-id={s.id} />;
          }

          return (
            <>
              <g opacity={hasSelection ? 0.3 : 1}>
                {nonSelected.map((s, i) => renderPath(s, i))}
              </g>
              {selected.length > 0 && (
                <g transform={strokeMoveOffset ? `translate(${strokeMoveOffset.dx},${strokeMoveOffset.dy})` : undefined}>
                  {selected.map((s, i) => renderPath(s, i))}
                </g>
              )}
            </>
          );
        })()}
        {erasePreview.size > 0 && [...erasePreview.values()].flat().map((frag, i) => {
          const isHighlighter = frag.color.length === 9;
          const outline = getStroke(frag.points, {
            thinning: isHighlighter ? 0 : ds.thinning,
            smoothing: ds.smoothing,
            streamline: ds.streamline,
            simulatePressure: isHighlighter ? false : ds.simulatePressure,
            size: frag.width,
          });
          return <path key={`ef-${i}`} d={svgPathFromStroke(outline)} fill={isDark ? flipLightness(frag.color) : frag.color} />;
        })}
        {selectionDragRect && (
          <rect
            x={selectionDragRect.x}
            y={selectionDragRect.y}
            width={selectionDragRect.width}
            height={selectionDragRect.height}
            fill="rgba(74,108,247,0.08)"
            stroke="rgba(74,108,247,0.7)"
            strokeWidth={1}
            strokeDasharray="5 3"
            style={{ pointerEvents: "none" }}
          />
        )}
        {effectiveModeRef.current === "segment-eraser" && eraserPos && (
          <circle
            cx={eraserPos[0]}
            cy={eraserPos[1]}
            r={penWidth}
            fill="none"
            stroke="rgba(80,80,80,0.6)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>
      <canvas
        ref={liveCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
