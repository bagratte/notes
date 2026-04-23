import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { pdfjsLib } from "./pdfSetup";
import DocumentOverlay from "./DocumentOverlay";
import RegionLinkModal from "./RegionLinkModal";
import type { EnrichedRegion, ToolMode } from "./DocumentOverlay";
import type { StrokeData } from "@/components/Canvas";
import { PenToolbar, DEFAULT_PEN } from "@/components/PenToolbar";
import type { PenSettings } from "@/components/PenToolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi } from "@/api";
import type { Stroke } from "@/types";
import css from "./DocumentViewer.module.css";

interface Props {
  url: string;
  documentId: number;
  activeSectionId?: number | null;
  onRegionClick?: (region: EnrichedRegion) => void;
}

interface NaturalSize {
  width: number;
  height: number;
}

interface PendingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

function toStrokeData(s: Stroke): StrokeData {
  return { points: s.points, color: s.color, width: s.width };
}

export default function DocumentViewer({ url, documentId, activeSectionId, onRegionClick }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [manualScale, setManualScale] = useState(1.0);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("view");
  const [inlineStrokes, setInlineStrokes] = useState<Stroke[]>([]);
  const [inlineRedoStack, setInlineRedoStack] = useState<Stroke[]>([]);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [regions, setRegions] = useState<EnrichedRegion[]>([]);
  const [pendingRegion, setPendingRegion] = useState<PendingRegion | null>(null);

  // ── load PDF ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPageNum(1);
    setNumPages(0);
    setNaturalSize(null);

    const task = pdfjsLib.getDocument(url);
    task.promise
      .then((doc) => {
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortException") return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      task.destroy();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [url]);

  // ── render page ────────────────────────────────────────────────────────────

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container || numPages === 0) return;

    renderTaskRef.current?.cancel();
    let cancelled = false;

    doc.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const naturalVp = page.getViewport({ scale: 1 });
      setNaturalSize({ width: naturalVp.width, height: naturalVp.height });

      const containerWidth = Math.max(400, container.clientWidth - 48);
      const scale = fitWidth ? containerWidth / naturalVp.width : manualScale;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      task.promise.catch((err: unknown) => {
        if (err instanceof Error && err.name !== "RenderingCancelledException") {
          console.error("PDF render error:", err);
        }
      });
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pageNum, numPages, fitWidth, manualScale]);

  // ── load strokes + regions for current page ────────────────────────────────

  useEffect(() => {
    if (!documentId || numPages === 0) return;
    setInlineStrokes([]);
    setRegions([]);

    strokesApi.listForPage(documentId, pageNum).then((data) => {
      setInlineStrokes(data);
      setInlineRedoStack([]);
    });

    regionsApi
      .list({ documentId, pageNumber: pageNum })
      .then(async (rawRegions) => {
        const enriched = await Promise.all(
          rawRegions.map(async (r) => {
            const section = await sectionsApi.get(r.section_id);
            return { ...r, note_id: section.note_id };
          })
        );
        setRegions(enriched);
      });
  }, [documentId, pageNum, numPages]);

  // ── inline stroke save + undo/redo ────────────────────────────────────────

  const handleInlineStroke = useCallback(
    async (stroke: StrokeData) => {
      const saved = await strokesApi.create({
        section_id: null,
        document_id: documentId,
        page_number: pageNum,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
      });
      setInlineStrokes((prev) => [...prev, saved]);
      setInlineRedoStack([]);
    },
    [documentId, pageNum]
  );

  const undoInline = useCallback(() => {
    setInlineStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setInlineRedoStack((r) => [...r, last]);
      strokesApi.delete(last.id);
      return prev.slice(0, -1);
    });
  }, []);

  const redoInline = useCallback(() => {
    setInlineRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      strokesApi
        .create({
          section_id: null,
          document_id: documentId,
          page_number: pageNum,
          points: last.points,
          color: last.color,
          width: last.width,
        })
        .then((saved) => setInlineStrokes((s) => [...s, saved]));
      return prev.slice(0, -1);
    });
  }, [documentId, pageNum]);

  // ── region creation ────────────────────────────────────────────────────────

  const handleRegionComplete = useCallback((rect: PendingRegion) => {
    setPendingRegion(rect);
  }, []);

  const handleModalLink = useCallback(
    async (noteId: number) => {
      if (!pendingRegion) return;

      // Count existing sections to determine order
      const existingSections = await sectionsApi.list(noteId);
      const section = await sectionsApi.create(noteId, existingSections.length);

      const region = await regionsApi.create({
        documentId,
        sectionId: section.id,
        pageNumber: pageNum,
        ...pendingRegion,
      });

      setRegions((prev) => [...prev, { ...region, note_id: noteId }]);
      setPendingRegion(null);
      setToolMode("view");
      navigate(`/notes/${noteId}`);
    },
    [pendingRegion, documentId, pageNum, navigate]
  );

  // ── navigation ─────────────────────────────────────────────────────────────

  const prevPage = useCallback(() => setPageNum((n) => Math.max(1, n - 1)), []);
  const nextPage = useCallback(
    () => setPageNum((n) => Math.min(numPages, n + 1)),
    [numPages]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoInline(); return; }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redoInline(); return; }
      }
      if (e.key === "a" || e.key === "A") { setToolMode((m) => m === "annotate" ? "view" : "annotate"); return; }
      if (e.key === "r" || e.key === "R") { setToolMode((m) => m === "region" ? "view" : "region"); return; }
      if (e.key === "Escape") { setToolMode("view"); return; }
      if (toolMode !== "view") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prevPage();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevPage, nextPage, toolMode, undoInline, redoInline]);

  // ── zoom ───────────────────────────────────────────────────────────────────

  const zoomIn = () => {
    setFitWidth(false);
    setManualScale((s) => ZOOM_STEPS.find((z) => z > s) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  };
  const zoomOut = () => {
    setFitWidth(false);
    setManualScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? ZOOM_STEPS[0]);
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (error) return <div className={css.state}>Failed to load PDF: {error}</div>;

  const viewBox = naturalSize
    ? `0 0 ${naturalSize.width} ${naturalSize.height}`
    : undefined;

  return (
    <div className={css.viewer}>
      <div className={css.toolbar}>
        {/* navigation */}
        <div className={css.toolbarGroup}>
          <button className={css.navBtn} onClick={prevPage} disabled={pageNum <= 1}>‹</button>
          <span className={css.pageInfo}>{loading ? "—" : `${pageNum} / ${numPages}`}</span>
          <button className={css.navBtn} onClick={nextPage} disabled={pageNum >= numPages || loading}>›</button>
        </div>

        <div className={css.toolbarSep} />

        {/* zoom */}
        <div className={css.toolbarGroup}>
          <button className={css.zoomBtn} onClick={zoomOut} disabled={loading}>−</button>
          <span className={css.zoomLevel}>
            {fitWidth ? "fit" : `${Math.round(manualScale * 100)}%`}
          </span>
          <button className={css.zoomBtn} onClick={zoomIn} disabled={loading}>+</button>
          <button
            className={`${css.fitBtn}${fitWidth ? " " + css.active : ""}`}
            onClick={() => setFitWidth(true)}
          >
            Fit width
          </button>
        </div>

        <div className={css.toolbarSep} />

        {/* tools */}
        <div className={css.toolbarGroup}>
          <button
            className={`${css.annotateBtn}${toolMode === "annotate" ? " " + css.active : ""}`}
            onClick={() => setToolMode((m) => m === "annotate" ? "view" : "annotate")}
            title="Annotate (A)"
          >
            ✎ Annotate
          </button>
          <button
            className={`${css.annotateBtn}${toolMode === "region" ? " " + css.active : ""}`}
            onClick={() => setToolMode((m) => m === "region" ? "view" : "region")}
            title="Region (R)"
          >
            ⬚ Region
          </button>
          {toolMode !== "view" && (
            <span className={css.annotateHint}>
              {toolMode === "annotate" ? "Drawing on page" : "Drag to mark region"} {pageNum}
            </span>
          )}
        </div>

        {toolMode === "annotate" && (
          <>
            <div className={css.toolbarSep} />
            <PenToolbar
              settings={pen}
              onChange={setPen}
              canUndo={inlineStrokes.length > 0}
              canRedo={inlineRedoStack.length > 0}
              onUndo={undoInline}
              onRedo={redoInline}
            />
          </>
        )}
      </div>

      <div ref={containerRef} className={css.scroll}>
        {loading ? (
          <div className={css.state}>Loading…</div>
        ) : (
          <div className={css.pageWrap}>
            <canvas ref={canvasRef} className={css.canvas} />
            <DocumentOverlay
              strokes={inlineStrokes.map(toStrokeData)}
              onStrokeComplete={handleInlineStroke}
              regions={regions}
              onRegionComplete={handleRegionComplete}
              onRegionClick={(r) => {
                if (onRegionClick) {
                  onRegionClick(r);
                } else {
                  navigate(`/documents/${documentId}/notes/${r.note_id}`);
                }
              }}
              activeSectionId={activeSectionId}
              mode={toolMode}
              viewBox={viewBox}
              naturalSize={naturalSize ?? undefined}
              color={pen.color}
              penWidth={pen.width}
              className={css.overlay}
            />
          </div>
        )}
      </div>

      {pendingRegion && (
        <RegionLinkModal
          onLink={handleModalLink}
          onCancel={() => setPendingRegion(null)}
        />
      )}
    </div>
  );
}
