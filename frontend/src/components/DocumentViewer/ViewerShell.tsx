import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import DocumentOverlay from "./DocumentOverlay";
import { Toolbar } from "@/components/Toolbar";
import { UndoRedoBar } from "@/components/UndoRedoBar";
import type { UseDocumentViewerResult } from "./useDocumentViewer";
import { toStrokeData, PAGE_GUTTER } from "./viewerTypes";
import css from "./DocumentViewer.module.css";

function parseUtc(iso: string): Date {
  return new Date(/[Z+]/.test(iso) ? iso : iso + "Z");
}

function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - parseUtc(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hr ago" : `${hrs} hrs ago`;
}

function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8A5.5 5.5 0 0 1 13 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 3.5l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 8A5.5 5.5 0 0 1 3 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 12.5l-2-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  activeStrokes: _activeStrokes,
  activeRedo,
  activeUndo,
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
  textLayerRefs,
  // callbacks
  getPageDisplaySize,
  prevPage,
  nextPage,
  handlePageInputSubmit,
  handleInlineStroke,
  handleEraseStroke,
  handleSegmentErase,
  handleBatchDeleteInline,
  handleBatchMoveInline,
  handleRegionComplete,
  handleRegionAddToNote,
  handleRegionUpdate,
  handleRegionClick,
  handleRegionDelete,
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
  // sync
  remotePage,
  remotePageUpdatedAt,
  syncAvailable,
  handleSync,
}: Props) {
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);

  useEffect(() => {
    if (toolMode !== "text-select") window.getSelection()?.removeAllRanges();
  }, [toolMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prevPage(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nextPage(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prevPage, nextPage]);

  const handleSyncClick = useCallback(() => {
    if (!syncAvailable || remotePage === null) return;
    const timeHint = remotePageUpdatedAt ? ` · ${formatTimeAgo(remotePageUpdatedAt)}` : "";
    if (window.confirm(`Jump to page ${remotePage}?${timeHint}`)) handleSync();
  }, [syncAvailable, remotePage, remotePageUpdatedAt, handleSync]);
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
          <button
            className={`${css.syncBtn}${syncAvailable ? " " + css.syncBtnActive : ""}`}
            onClick={handleSyncClick}
            disabled={!syncAvailable || loading}
            title={syncAvailable && remotePage !== null ? `Sync to page ${remotePage}` : "No sync available"}
          >
            <SyncIcon />
          </button>
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
          availableTools={["auto", "hand", "pen", "highlighter", "stroke-eraser", "segment-eraser", "stroke-select", "select-region", "text-select"]}
          activeOverride={hwOverride}
        />

        <div className={css.toolbarSep} />

        <UndoRedoBar
          canUndo={activeUndo.length > 0}
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
            : toolMode === "text-select"
            ? { cursor: "text" }
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
                      <div
                        ref={(el) => {
                          if (el) textLayerRefs.current.set(page, el);
                          else textLayerRefs.current.delete(page);
                        }}
                        className={css.textLayer}
                        style={{
                          display: toolMode === "text-select" ? "block" : "none",
                          ["--scale-factor" as string]: width / natural.width,
                        } as CSSProperties}
                      />
                      {overlayEnabled && (
                        <DocumentOverlay
                          strokes={strokes.map(toStrokeData)}
                          onStrokeComplete={(stroke) => handleInlineStroke(page, stroke)}
                          onEraseStroke={(id) => handleEraseStroke(page, id)}
                          onSegmentErase={(del, cr) => handleSegmentErase(page, del, cr)}
                          regions={regions}
                          onRegionComplete={(rect) => handleRegionComplete(page, rect)}
                          onRegionAddToNote={(rect, noteId) => handleRegionAddToNote(page, rect, noteId)}
                          onRegionUpdate={(regionId, rect) => handleRegionUpdate(page, regionId, rect)}
                          onRegionClick={handleRegionClick}
                          onRegionDelete={(region) => handleRegionDelete(page, region)}
                          onHwOverrideChange={setHwOverride}
                          onBatchDelete={(strokes) => void handleBatchDeleteInline(page, strokes)}
                          onBatchMove={(del, cr) => void handleBatchMoveInline(page, del, cr)}
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
