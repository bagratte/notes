import { useDrawing } from "./useDrawing";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "./utils";
import type { StrokeData } from "./types";
import type { ToolMode } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";

interface Props {
  strokes: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  onEraseStroke?: (id: number) => void;
  onSegmentErase?: (deleted: number[], created: StrokeData[]) => void;
  onHwOverrideChange?: (o: "stroke-eraser" | "segment-eraser" | null) => void;
  eraserMode?: boolean;
  segmentEraserMode?: boolean;
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

export default function DrawingCanvas({
  strokes,
  onStrokeComplete,
  onEraseStroke,
  onSegmentErase,
  onHwOverrideChange,
  eraserMode = false,
  segmentEraserMode = false,
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
  const { settings: ds } = useDrawingSettings();

  const mode: ToolMode = segmentEraserMode ? "segment-eraser" : eraserMode ? "stroke-eraser" : "pen";

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
    viewBox,
    inputEnabled,
    readonly,
    onStrokeComplete,
    onEraseStroke,
    onSegmentErase,
    onHwOverrideChange,
  });

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
          touchAction: inputEnabled && !ds.fingerScrolls ? "none" : "auto",
          pointerEvents: inputEnabled ? "all" : "none",
          cursor: !inputEnabled
            ? "grab"
            : effectiveModeRef.current === "stroke-eraser"
            ? "cell"
            : effectiveModeRef.current === "segment-eraser"
            ? "none"
            : activePointerType === "pen"
            ? "none"
            : "default",
          display: "block",
        }}
        {...svgHandlers}
      >
        {strokes
          .filter(s => !erasePreview.has(s.id as number))
          .map((s, i) => {
            const cacheKey: number | StrokeData = s.id ?? s;
            const cached = strokePathCache.current.get(cacheKey);
            let d: string;
            if (cached && cached.points === s.points) {
              d = cached.d;
            } else {
              const outline = getStroke(s.points, {
                thinning: ds.thinning,
                smoothing: ds.smoothing,
                streamline: ds.streamline,
                simulatePressure: ds.simulatePressure,
                size: s.width,
              });
              d = svgPathFromStroke(outline);
              strokePathCache.current.set(cacheKey, { points: s.points, d });
            }
            return <path key={s.id ?? i} d={d} fill={s.color} data-stroke-id={s.id} />;
          })}
        {erasePreview.size > 0 && [...erasePreview.values()].flat().map((frag, i) => {
          const outline = getStroke(frag.points, {
            thinning: ds.thinning,
            smoothing: ds.smoothing,
            streamline: ds.streamline,
            simulatePressure: ds.simulatePressure,
            size: frag.width,
          });
          return <path key={`ef-${i}`} d={svgPathFromStroke(outline)} fill={frag.color} />;
        })}
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
