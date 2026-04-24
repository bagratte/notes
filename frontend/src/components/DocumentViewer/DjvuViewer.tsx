import { useEffect, useRef, useState, useCallback } from "react";
import DocumentOverlay from "./DocumentOverlay";
import type { EnrichedRegion, ToolMode } from "./DocumentOverlay";
import type { StrokeData } from "@/components/Canvas";
import { PenToolbar, DEFAULT_PEN } from "@/components/PenToolbar";
import type { PenSettings } from "@/components/PenToolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi, notes as notesApi } from "@/api";
import type { Stroke } from "@/types";
import { useNavigate } from "react-router-dom";
import css from "./DocumentViewer.module.css";

interface Props {
  url: string;
  documentId: number;
  folderId?: number;
  initialPage?: number;
}

interface NaturalSize {
  width: number;
  height: number;
}

interface PendingRegion {
  x: number; y: number; width: number; height: number;
}

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

function toStrokeData(s: Stroke): StrokeData {
  return { points: s.points, color: s.color, width: s.width };
}

export default function DjvuViewer({ url, documentId, folderId, initialPage }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<DjVuDocument | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(initialPage ?? 1);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [scale, setScale] = useState(1.0);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("view");
  const [inlineStrokes, setInlineStrokes] = useState<Stroke[]>([]);
  const [inlineRedoStack, setInlineRedoStack] = useState<Stroke[]>([]);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [regions, setRegions] = useState<EnrichedRegion[]>([]);

  // ── load document ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPageNum(1);
    setNumPages(0);
    let cancelled = false;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const doc = new DjVu.Document(buffer);
        docRef.current = doc;
        setNumPages(doc.getPagesQuantity());
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  // ── render page ────────────────────────────────────────────────────────────

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container || numPages === 0) return;

    let cancelled = false;

    doc.getPage(pageNum).then((page) => {
      if (cancelled) return;

      const naturalW = page.getWidth();
      const naturalH = page.getHeight();
      setNaturalSize({ width: naturalW, height: naturalH });

      const containerWidth = Math.max(400, container.clientWidth - 48);
      const effectiveScale = fitWidth ? containerWidth / naturalW : scale;

      canvas.width = Math.round(naturalW * effectiveScale);
      canvas.height = Math.round(naturalH * effectiveScale);

      const imageData = page.getImageData();
      const ctx = canvas.getContext("2d")!;

      const offscreen = document.createElement("canvas");
      offscreen.width = imageData.width;
      offscreen.height = imageData.height;
      offscreen.getContext("2d")!.putImageData(imageData, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

      page.reset();
    }).catch((err: unknown) => {
      if (!cancelled) setError(String(err));
    });

    return () => { cancelled = true; };
  }, [pageNum, numPages, scale, fitWidth]);

  // ── cross-component sync ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { documentId: dId, pageNumber } = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      if (dId === documentId && pageNumber === pageNum)
        strokesApi.listForPage(documentId, pageNum).then(setInlineStrokes);
    };
    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, [documentId, pageNum]);

  // ── load strokes + regions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!documentId || numPages === 0) return;
    setInlineStrokes([]);
    setInlineRedoStack([]);
    setRegions([]);

    strokesApi.listForPage(documentId, pageNum).then((data) => {
      setInlineStrokes(data);
    });

    regionsApi.list({ documentId, pageNumber: pageNum }).then(async (rawRegions) => {
      const enriched = await Promise.all(
        rawRegions.map(async (r) => {
          const section = await sectionsApi.get(r.section_id);
          return { ...r, note_id: section.note_id };
        })
      );
      setRegions(enriched);
    });
  }, [documentId, pageNum, numPages]);

  // ── stroke + undo/redo handlers ───────────────────────────────────────────

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
      setInlineStrokes((prev) => {
        if (prev.length === 0)
          window.dispatchEvent(new CustomEvent("document:page-strokes-changed",
            { detail: { documentId, pageNumber: pageNum } }));
        return [...prev, saved];
      });
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
      if (prev.length === 1)
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed",
          { detail: { documentId, pageNumber: pageNum } }));
      return prev.slice(0, -1);
    });
  }, [documentId, pageNum]);

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
        .then((saved) => setInlineStrokes((s) => {
          if (s.length === 0)
            window.dispatchEvent(new CustomEvent("document:page-strokes-changed",
              { detail: { documentId, pageNumber: pageNum } }));
          return [...s, saved];
        }));
      return prev.slice(0, -1);
    });
  }, [documentId, pageNum]);

  // ── region handlers ────────────────────────────────────────────────────────

  const handleRegionComplete = useCallback(async (rect: PendingRegion) => {
    const note = await notesApi.create("Untitled Note", folderId);
    const existingSections = await sectionsApi.list(note.id);
    const section = await sectionsApi.create(note.id, existingSections.length);
    const region = await regionsApi.create({
      documentId, sectionId: section.id, pageNumber: pageNum, ...rect,
    });
    setRegions((prev) => [...prev, { ...region, note_id: note.id }]);
    setToolMode("view");
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate(`/notes/${note.id}`);
  }, [documentId, pageNum, navigate]);

  // ── navigation ─────────────────────────────────────────────────────────────

  const prevPage = useCallback(() => setPageNum((n) => Math.max(1, n - 1)), []);
  const nextPage = useCallback(() => setPageNum((n) => Math.min(numPages, n + 1)), [numPages]);

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
    setScale((s) => ZOOM_STEPS.find((z) => z > s) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  };
  const zoomOut = () => {
    setFitWidth(false);
    setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? ZOOM_STEPS[0]);
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (error) return <div className={css.state}>Failed to load DjVu: {error}</div>;

  const viewBox = naturalSize
    ? `0 0 ${naturalSize.width} ${naturalSize.height}`
    : undefined;

  return (
    <div className={css.viewer}>
      <div className={css.toolbar}>
        <div className={css.toolbarGroup}>
          <button className={css.navBtn} onClick={prevPage} disabled={pageNum <= 1}>‹</button>
          <span className={css.pageInfo}>{loading ? "—" : `${pageNum} / ${numPages}`}</span>
          <button className={css.navBtn} onClick={nextPage} disabled={pageNum >= numPages || loading}>›</button>
        </div>

        <div className={css.toolbarSep} />

        <div className={css.toolbarGroup}>
          <button className={css.zoomBtn} onClick={zoomOut} disabled={loading}>−</button>
          <span className={css.zoomLevel}>
            {fitWidth ? "fit" : `${Math.round(scale * 100)}%`}
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
              onRegionClick={(r) => navigate(`/notes/${r.note_id}`)}
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

    </div>
  );
}
