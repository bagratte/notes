import { useMemo, useState } from "react";
import DocumentOverlay from "./DocumentOverlay";
import { Toolbar } from "@/components/Toolbar";
import { UndoRedoBar } from "@/components/UndoRedoBar";
import type { UseDocumentViewerResult } from "./useDocumentViewer";
import { toStrokeData, PAGE_GUTTER } from "./viewerTypes";
import css from "./DocumentViewer.module.css";

interface Props extends UseDocumentViewerResult {
  overlayEnabled: boolean;
  errorLabel: string;
}

export default function ViewerShell({
  overlayEnabled,
  errorLabel,
  // state
  numPages,
  pageNum,
  pageInput,
  fitMode,
  fitPopoverOpen,
  manualScale,
  loading,
  error,
  toolMode,
  pen,
  isPanning,
  windowRange,
  activeStrokes,
  activeRedo,
  strokesByPage,
  regionsByPage,
  // setters
  setPageInput,
  setFitMode,
  setFitPopoverOpen,
  setManualScale,
  setToolMode,
  setPen,
  // refs
  containerRef,
  pageRefs,
  canvasRefs,
  // callbacks
  getPageDisplaySize,
  prevPage,
  nextPage,
  handlePageInputSubmit,
  handleInlineStroke,
  handleEraseStroke,
  handleSegmentErase,
  handleRegionComplete,
  handleRegionUpdate,
  handleRegionClick,
  stopPointerPan,
  handleScrollPointerDown,
  handleScrollPointerMove,
  handleScrollPointerUp,
  handleScrollPointerCancel,
  zoomIn,
  zoomOut,
  undoInline,
  redoInline,
  // drawing settings
  updateDs: _updateDs,
}: Props) {
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);
  const pages = useMemo(() => {
    const values: number[] = [];
    for (let p = 1; p <= numPages; p += 1) values.push(p);
    return values;
  }, [numPages]);

  if (error) return <div className={css.state}>Failed to load {errorLabel}: {error}</div>;

  return (
    <div className={css.viewer}>
      <div className={css.toolbar}>
        <div className={css.toolbarGroup}>
          <button className={css.navBtn} onClick={prevPage} disabled={pageNum <= 1 || loading}>‹</button>
          <input
            className={css.pageInput}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handlePageInputSubmit(); }}
            onBlur={handlePageInputSubmit}
            disabled={loading}
            aria-label="Page"
          />
          <span className={css.pageCount}>{loading ? "- / -" : `${pageNum} / ${numPages}`}</span>
          <button className={css.navBtn} onClick={nextPage} disabled={pageNum >= numPages || loading}>›</button>
        </div>

        <div className={css.toolbarSep} />

        <div className={css.toolbarGroup}>
          <button className={css.zoomBtn} onClick={zoomOut} disabled={loading}>-</button>
          {fitPopoverOpen && <div className={css.fitBackdrop} onPointerDown={() => setFitPopoverOpen(false)} />}
          <div className={css.fitWrapper}>
            <button
              className={css.zoomLevelBtn}
              onClick={() => setFitPopoverOpen((o) => !o)}
              disabled={loading}
              title="Zoom"
            >
              {Math.round(getPageDisplaySize(pageNum).scale * 100)}%
            </button>
            {fitPopoverOpen && (
              <div className={css.fitPopover}>
                <button
                  className={`${css.fitPopoverItem}${fitMode === "width" ? " " + css.fitPopoverItemActive : ""}`}
                  onPointerDown={(e) => { e.stopPropagation(); setFitMode("width"); setFitPopoverOpen(false); }}
                >Fit Width</button>
                <button
                  className={`${css.fitPopoverItem}${fitMode === "page" ? " " + css.fitPopoverItemActive : ""}`}
                  onPointerDown={(e) => { e.stopPropagation(); setFitMode("page"); setFitPopoverOpen(false); }}
                >Fit Page</button>
                <button
                  className={`${css.fitPopoverItem}${fitMode === "manual" && manualScale === 1.0 ? " " + css.fitPopoverItemActive : ""}`}
                  onPointerDown={(e) => { e.stopPropagation(); setFitMode("manual"); setManualScale(1.0); setFitPopoverOpen(false); }}
                >Actual Size</button>
              </div>
            )}
          </div>
          <button className={css.zoomBtn} onClick={zoomIn} disabled={loading}>+</button>
        </div>

        <div className={css.toolbarSep} />

        <Toolbar
          settings={pen}
          onChange={setPen}
          tool={toolMode}
          onToolChange={setToolMode}
          availableTools={["auto", "hand", "pen", "stroke-eraser", "segment-eraser", "select-region"]}
          activeOverride={hwOverride}
        />

        <div className={css.toolbarSep} />

        <UndoRedoBar
          canUndo={activeStrokes.length > 0}
          canRedo={activeRedo.length > 0}
          onUndo={undoInline}
          onRedo={redoInline}
        />
      </div>

      <div
        ref={containerRef}
        className={css.scroll}
        style={
          toolMode === "hand"
            ? { cursor: isPanning ? "grabbing" : "grab", userSelect: isPanning ? "none" : undefined }
            : undefined
        }
        onPointerDown={handleScrollPointerDown}
        onPointerMove={handleScrollPointerMove}
        onPointerUp={handleScrollPointerUp}
        onPointerCancel={handleScrollPointerCancel}
        onLostPointerCapture={stopPointerPan}
      >
        {loading ? (
          <div className={css.state}>Loading...</div>
        ) : (
          <div className={css.pageStack}>
            {pages.map((page) => {
              const isBuffered = page >= windowRange.start && page <= windowRange.end;
              const { width, height, natural } = getPageDisplaySize(page);
              const viewBox = `0 0 ${natural.width} ${natural.height}`;
              const regions = regionsByPage[page] ?? [];
              const strokes = strokesByPage[page] ?? [];

              return (
                <div
                  key={page}
                  ref={(el) => {
                    if (el) pageRefs.current.set(page, el);
                    else pageRefs.current.delete(page);
                  }}
                  className={`${css.pageWrap}${page === pageNum ? ` ${css.pageActive}` : ""}`}
                  data-page={page}
                  style={{ width: `${width}px`, height: `${height}px`, marginBottom: `${PAGE_GUTTER}px` }}
                >
                  {isBuffered ? (
                    <>
                      <canvas
                        ref={(el) => {
                          if (el) canvasRefs.current.set(page, el);
                          else canvasRefs.current.delete(page);
                        }}
                        className={css.canvas}
                      />
                      {overlayEnabled && (
                        <DocumentOverlay
                          strokes={strokes.map(toStrokeData)}
                          onStrokeComplete={(stroke) => handleInlineStroke(page, stroke)}
                          onEraseStroke={(id) => handleEraseStroke(page, id)}
                          onSegmentErase={(del, cr) => handleSegmentErase(page, del, cr)}
                          regions={regions}
                          onRegionComplete={(rect) => handleRegionComplete(page, rect)}
                          onRegionUpdate={(regionId, rect) => handleRegionUpdate(page, regionId, rect)}
                          onRegionClick={handleRegionClick}
                          onHwOverrideChange={setHwOverride}
                          mode={toolMode}
                          viewBox={viewBox}
                          naturalSize={natural}
                          color={pen.color}
                          penWidth={pen.width}
                          className={css.overlay}
                        />
                      )}
                    </>
                  ) : (
                    <div className={css.pagePlaceholder}>Page {page}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
