import { useMemo } from "react";
import DocumentOverlay from "./DocumentOverlay";
import { PenToolbar } from "@/components/PenToolbar";
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
  ds,
  updateDs,
}: Props) {
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

        <div className={css.toolbarGroup}>
          <button
            className={`${css.zoomBtn}${toolMode === "region" ? ` ${css.active}` : ""}`}
            onClick={() => setToolMode((m) => (m === "region" ? "annotate" : "region"))}
            title="Region (R)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5V2a1 1 0 0 1 1-1h3M9 1h3a1 1 0 0 1 1 1v3M13 9v3a1 1 0 0 1-1 1H9M5 13H2a1 1 0 0 1-1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className={css.toolbarSep} />

        <PenToolbar
          settings={pen}
          mode={toolMode === "view" ? "hand" : toolMode}
          onChange={(settings) => {
            setPen(settings);
            if (toolMode === "view") setToolMode("annotate");
          }}
          onModeChange={(mode) => setToolMode(mode === "hand" ? "view" : mode)}
          fingerScrolls={ds.fingerScrolls}
          onFingerScrollsChange={(v) => updateDs({ fingerScrolls: v })}
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
          toolMode === "view"
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
