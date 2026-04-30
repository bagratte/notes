import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { pdfjsLib } from "./pdfSetup";
import DocumentOverlay from "./DocumentOverlay";
import type { EnrichedRegion, ToolMode } from "./DocumentOverlay";
import type { StrokeData } from "@/components/Canvas";
import { PenToolbar, DEFAULT_PEN } from "@/components/PenToolbar";
import type { PenSettings } from "@/components/PenToolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi, notes as notesApi } from "@/api";
import type { Stroke } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";
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
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  isActive: boolean;
}

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
const WINDOW_BUFFER = 2;
const PAGE_GUTTER = 16;
const PAN_DEADZONE_PX = 8;
const PAGE_FALLBACK_WIDTH = 900;
const PAGE_FALLBACK_HEIGHT = 1200;

function toStrokeData(s: Stroke): StrokeData {
  return { id: s.id, points: s.points, color: s.color, width: s.width };
}

function getDisplayScale(
  fitMode: "width" | "page" | "manual",
  manualScale: number,
  natural: NaturalSize,
  viewport: ViewportSize
): number {
  const containerWidth = Math.max(400, viewport.width - 48);
  const containerHeight = Math.max(300, viewport.height - 48);
  if (fitMode === "width") return containerWidth / natural.width;
  if (fitMode === "page") return Math.min(containerWidth / natural.width, containerHeight / natural.height);
  return manualScale;
}

export default function DocumentViewer({ url, documentId, folderId, initialPage }: Props) {
  const navigate = useNavigate();
  const { settings: ds, update: updateDs } = useDrawingSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());
  const renderVersionRef = useRef<Map<number, number>>(new Map());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const loadedStrokePagesRef = useRef<Set<number>>(new Set());
  const loadedRegionPagesRef = useRef<Set<number>>(new Set());
  const sectionNoteCacheRef = useRef<Map<number, number>>(new Map());
  const suppressScrollSyncRef = useRef(false);
  const panStateRef = useRef<PanState | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(() => Math.max(1, initialPage ?? 1));
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const [pageInput, setPageInput] = useState("");
  const [fitMode, setFitMode] = useState<"width" | "page" | "manual">("width");
  const [fitPopoverOpen, setFitPopoverOpen] = useState(false);
  const [manualScale, setManualScale] = useState(1.0);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 1200, height: 900 });
  const [naturalSizes, setNaturalSizes] = useState<Record<number, NaturalSize>>({});
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [redoByPage, setRedoByPage] = useState<Record<number, Stroke[]>>({});
  const [regionsByPage, setRegionsByPage] = useState<Record<number, EnrichedRegion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("annotate");
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [isPanning, setIsPanning] = useState(false);

  const [windowRange, setWindowRange] = useState(() => ({ start: 1, end: Math.max(1, initialPage ?? 1) }));

  const activeStrokes = strokesByPage[pageNum] ?? [];
  const activeRedo = redoByPage[pageNum] ?? [];

  const getPageNaturalSize = useCallback(
    (page: number) => naturalSizes[page] ?? { width: PAGE_FALLBACK_WIDTH, height: PAGE_FALLBACK_HEIGHT },
    [naturalSizes]
  );

  const getPageDisplaySize = useCallback(
    (page: number) => {
      const natural = getPageNaturalSize(page);
      const scale = getDisplayScale(fitMode, manualScale, natural, viewport);
      return {
        width: natural.width * scale,
        height: natural.height * scale,
        scale,
        natural,
      };
    },
    [fitMode, manualScale, viewport, getPageNaturalSize]
  );

  const updateWindowFromPage = useCallback(
    (activePage: number) => {
      if (numPages === 0) return;
      const start = Math.max(1, activePage - WINDOW_BUFFER);
      const end = Math.min(numPages, activePage + WINDOW_BUFFER);
      setWindowRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    },
    [numPages]
  );

  const loadPdfPageNaturalSize = useCallback(async (page: number) => {
    const doc = pdfDocRef.current;
    if (!doc || naturalSizes[page] || loadingPagesRef.current.has(page)) return;

    loadingPagesRef.current.add(page);
    try {
      const pdfPage = await doc.getPage(page);
      const vp = pdfPage.getViewport({ scale: 1 });
      setNaturalSizes((prev) => {
        if (prev[page]) return prev;
        return { ...prev, [page]: { width: vp.width, height: vp.height } };
      });
    } finally {
      loadingPagesRef.current.delete(page);
    }
  }, [naturalSizes]);

  const loadPageData = useCallback(
    async (page: number, force = false) => {
      if (!force && loadedStrokePagesRef.current.has(page) && loadedRegionPagesRef.current.has(page)) {
        return;
      }

      const [strokeData, rawRegions] = await Promise.all([
        strokesApi.listForPage(documentId, page),
        regionsApi.list({ documentId, pageNumber: page }),
      ]);

      setStrokesByPage((prev) => ({ ...prev, [page]: strokeData }));
      setRedoByPage((prev) => (prev[page] ? { ...prev, [page]: [] } : prev));
      loadedStrokePagesRef.current.add(page);

      const enriched: EnrichedRegion[] = await Promise.all(
        rawRegions.map(async (r) => {
          const cached = sectionNoteCacheRef.current.get(r.section_id);
          if (cached !== undefined) {
            return { ...r, note_id: cached };
          }
          const section = await sectionsApi.get(r.section_id);
          sectionNoteCacheRef.current.set(r.section_id, section.note_id);
          return { ...r, note_id: section.note_id };
        })
      );

      setRegionsByPage((prev) => ({ ...prev, [page]: enriched }));
      loadedRegionPagesRef.current.add(page);
    },
    [documentId]
  );

  const scrollToPage = useCallback((targetPage: number, behavior: ScrollBehavior = "smooth") => {
    const clamped = Math.max(1, Math.min(numPages, targetPage));
    setPageNum(clamped);
    const el = pageRefs.current.get(clamped);
    const container = containerRef.current;
    if (!el || !container) return;

    suppressScrollSyncRef.current = true;
    el.scrollIntoView({ behavior, block: "center" });
    window.setTimeout(() => {
      suppressScrollSyncRef.current = false;
    }, behavior === "smooth" ? 240 : 0);
  }, [numPages]);

  const syncActivePageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || suppressScrollSyncRef.current || numPages === 0) return;

    const center = container.scrollTop + container.clientHeight / 2;
    let bestPage = pageNum;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let p = 1; p <= numPages; p += 1) {
      const el = pageRefs.current.get(p);
      if (!el) continue;
      const pageCenter = el.offsetTop + el.offsetHeight / 2;
      const distance = Math.abs(pageCenter - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = p;
      }
    }

    if (bestPage !== pageNum) {
      setPageNum(bestPage);
    }
  }, [numPages, pageNum]);

  // load PDF
  useEffect(() => {
    let destroyed = false;
    setLoading(true);
    setError(null);
    setPageNum(Math.max(1, initialPage ?? 1));
    setNumPages(0);
    setPageLabels(null);
    setPageInput("");
    setNaturalSizes({});
    setStrokesByPage({});
    setRedoByPage({});
    setRegionsByPage({});
    setWindowRange({ start: 1, end: Math.max(1, initialPage ?? 1) });

    loadingPagesRef.current.clear();
    loadedStrokePagesRef.current.clear();
    loadedRegionPagesRef.current.clear();
    sectionNoteCacheRef.current.clear();

    const task = pdfjsLib.getDocument(url);
    task.promise
      .then(async (doc) => {
        if (destroyed) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
        const labels = await doc.getPageLabels().catch(() => null);
        if (!destroyed) setPageLabels(labels);
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        if (err instanceof Error && err.name === "AbortException") return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      destroyed = true;
      task.destroy();
      renderTasksRef.current.forEach((taskRef) => taskRef.cancel());
      renderTasksRef.current.clear();
      renderVersionRef.current.clear();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [url, initialPage]);

  // keep viewport size up to date for fit calculations
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // keep page input in sync
  useEffect(() => {
    setPageInput(pageLabels ? pageLabels[pageNum - 1] ?? String(pageNum) : String(pageNum));
  }, [pageNum, pageLabels]);

  // update window from active page
  useEffect(() => {
    updateWindowFromPage(pageNum);
  }, [pageNum, updateWindowFromPage]);

  // load page sizes and data for buffered window
  useEffect(() => {
    if (numPages === 0) return;

    const pages: number[] = [];
    for (let p = windowRange.start; p <= windowRange.end; p += 1) pages.push(p);

    pages.forEach((page) => {
      void loadPdfPageNaturalSize(page);
      void loadPageData(page);
    });
  }, [numPages, windowRange, loadPdfPageNaturalSize, loadPageData]);

  // render buffered pages
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || numPages === 0) return;

    for (let page = windowRange.start; page <= windowRange.end; page += 1) {
      const canvas = canvasRefs.current.get(page);
      const natural = naturalSizes[page];
      if (!canvas || !natural) continue;

      const { scale } = getPageDisplaySize(page);
      const width = Math.round(natural.width * scale);
      const height = Math.round(natural.height * scale);
      if (canvas.width === width && canvas.height === height) continue;

      const version = (renderVersionRef.current.get(page) ?? 0) + 1;
      renderVersionRef.current.set(page, version);

      const previousTask = renderTasksRef.current.get(page);
      if (previousTask) {
        previousTask.cancel();
        renderTasksRef.current.delete(page);
      }

      doc.getPage(page).then((pdfPage) => {
        if (renderVersionRef.current.get(page) !== version) return;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        const viewportForRender = pdfPage.getViewport({ scale });
        const task = pdfPage.render({ canvasContext: ctx, viewport: viewportForRender });
        renderTasksRef.current.set(page, task);

        task.promise
          .catch((err: unknown) => {
            if (err instanceof Error && err.name !== "RenderingCancelledException") {
              console.error("PDF render error:", err);
            }
          })
          .finally(() => {
            if (renderTasksRef.current.get(page) === task) {
              renderTasksRef.current.delete(page);
            }
          });
      }).catch((err: unknown) => {
        console.error("Failed to render PDF page", page, err);
      });
    }
  }, [numPages, windowRange, naturalSizes, getPageDisplaySize]);

  // scroll sync listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncActivePageFromScroll();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [numPages, syncActivePageFromScroll]);

  // jump to initial page after layout
  useEffect(() => {
    if (numPages === 0) return;
    const target = Math.max(1, Math.min(numPages, initialPage ?? 1));
    window.requestAnimationFrame(() => {
      scrollToPage(target, "auto");
    });
  }, [numPages, initialPage, scrollToPage]);

  // sync updates from other components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      if (detail.documentId !== documentId) return;
      void loadPageData(detail.pageNumber, true);
    };

    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, [documentId, loadPageData]);

  const handlePageInputSubmit = useCallback(() => {
    const raw = pageInput.trim();
    if (pageLabels) {
      const idx = pageLabels.findIndex((label) => label.toLowerCase() === raw.toLowerCase());
      if (idx >= 0) {
        scrollToPage(idx + 1);
        return;
      }
    }

    const numeric = parseInt(raw, 10);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= numPages) {
      scrollToPage(numeric);
      return;
    }

    setPageInput(pageLabels ? pageLabels[pageNum - 1] ?? String(pageNum) : String(pageNum));
  }, [pageInput, pageLabels, pageNum, numPages, scrollToPage]);

  const handleInlineStroke = useCallback(
    async (page: number, stroke: StrokeData) => {
      const tempId = -Date.now();
      const optimistic: Stroke = {
        id: tempId,
        section_id: null,
        document_id: documentId,
        page_number: page,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
        created_at: new Date().toISOString(),
      };

      let firstStroke = false;
      setStrokesByPage((prev) => {
        const existing = prev[page] ?? [];
        firstStroke = existing.length === 0;
        return { ...prev, [page]: [...existing, optimistic] };
      });
      setRedoByPage((prev) => ({ ...prev, [page]: [] }));
      loadedStrokePagesRef.current.add(page);

      const saved = await strokesApi.create({
        section_id: null,
        document_id: documentId,
        page_number: page,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
      });
      setStrokesByPage((prev) => ({
        ...prev,
        [page]: (prev[page] ?? []).map((s) => (s.id === tempId ? saved : s)),
      }));

      if (firstStroke) {
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
          detail: { documentId, pageNumber: page },
        }));
      }
    },
    [documentId]
  );

  const undoInline = useCallback(async () => {
    const page = pageNum;
    const pageStrokes = strokesByPage[page] ?? [];
    if (pageStrokes.length === 0) return;

    const last = pageStrokes[pageStrokes.length - 1];
    if (last.id < 0) return; // in-flight optimistic stroke — skip

    setStrokesByPage((prev) => ({ ...prev, [page]: pageStrokes.slice(0, -1) }));
    setRedoByPage((prev) => ({ ...prev, [page]: [...(prev[page] ?? []), last] }));

    await strokesApi.delete(last.id);

    if (pageStrokes.length === 1) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId, pageNum, strokesByPage]);

  const redoInline = useCallback(() => {
    const page = pageNum;
    const redoList = redoByPage[page] ?? [];
    if (redoList.length === 0) return;

    const last = redoList[redoList.length - 1];

    void strokesApi
      .create({
        section_id: null,
        document_id: documentId,
        page_number: page,
        points: last.points,
        color: last.color,
        width: last.width,
      })
      .then((saved) => {
        setStrokesByPage((prev) => {
          const current = prev[page] ?? [];
          if (current.length === 0) {
            window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
              detail: { documentId, pageNumber: page },
            }));
          }
          return { ...prev, [page]: [...current, saved] };
        });
        loadedStrokePagesRef.current.add(page);
      });

    setRedoByPage((prev) => ({ ...prev, [page]: redoList.slice(0, -1) }));
  }, [documentId, pageNum, redoByPage]);

  const handleEraseStroke = useCallback(async (page: number, id: number) => {
    let wasLast = false;
    setStrokesByPage((prev) => {
      const current = prev[page] ?? [];
      if (!current.find((s) => s.id === id)) return prev;
      const next = current.filter((s) => s.id !== id);
      wasLast = next.length === 0;
      return { ...prev, [page]: next };
    });

    await strokesApi.delete(id);

    if (wasLast) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId]);

  const handleSegmentErase = useCallback(async (page: number, deleted: number[], created: StrokeData[]) => {
    const tempIds = created.map((_, i) => -(Date.now() + i));
    let lastStrokeErased = false;
    setStrokesByPage(prev => {
      const current = prev[page] ?? [];
      const next = current.filter(s => !deleted.includes(s.id!));
      lastStrokeErased = next.length === 0 && current.length > 0 && created.length === 0;
      const optimistic: Stroke[] = created.map((s, i) => ({
        id: tempIds[i], section_id: null, document_id: documentId,
        page_number: page, points: s.points, color: s.color, width: s.width,
        created_at: new Date().toISOString(),
      }));
      return { ...prev, [page]: [...next, ...optimistic] };
    });

    await Promise.all(deleted.map(id => strokesApi.delete(id)));

    if (created.length > 0) {
      const saved = await strokesApi.createBatch(created.map(s => ({
        section_id: null, document_id: documentId, page_number: page,
        points: s.points, color: s.color, width: s.width,
      })));
      setStrokesByPage(prev => {
        const without = (prev[page] ?? []).filter(s => !tempIds.includes(s.id));
        return { ...prev, [page]: [...without, ...saved] };
      });
    }

    if (lastStrokeErased) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId]);

  const handleRegionComplete = useCallback(async (page: number, rect: PendingRegion) => {
    const note = await notesApi.create("Untitled Note", folderId);
    const existingSections = await sectionsApi.list(note.id);
    const section = await sectionsApi.create(note.id, existingSections.length);

    const region = await regionsApi.create({
      documentId,
      sectionId: section.id,
      pageNumber: page,
      ...rect,
    });

    setRegionsByPage((prev) => {
      const existing = prev[page] ?? [];
      return { ...prev, [page]: [...existing, { ...region, note_id: note.id }] };
    });

    sectionNoteCacheRef.current.set(section.id, note.id);
    loadedRegionPagesRef.current.add(page);
    setToolMode("view");
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate(`/notes/${note.id}`);
  }, [documentId, folderId, navigate]);

  const prevPage = useCallback(() => scrollToPage(pageNum - 1), [pageNum, scrollToPage]);
  const nextPage = useCallback(() => scrollToPage(pageNum + 1), [pageNum, scrollToPage]);

  const stopPointerPan = useCallback(() => {
    if (panStateRef.current) {
      panStateRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const handleScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== "view") return;
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;

    panStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: e.currentTarget.scrollLeft,
      startScrollTop: e.currentTarget.scrollTop,
      isActive: false,
    };
  }, [toolMode]);

  const handleScrollPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;

    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;

    if (!pan.isActive) {
      if (Math.hypot(dx, dy) < PAN_DEADZONE_PX) return;
      pan.isActive = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
    }

    e.currentTarget.scrollLeft = pan.startScrollLeft - dx;
    e.currentTarget.scrollTop = pan.startScrollTop - dy;
    e.preventDefault();
  }, []);

  const handleScrollPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    stopPointerPan();
  }, [stopPointerPan]);

  const handleScrollPointerCancel = useCallback(() => {
    stopPointerPan();
  }, [stopPointerPan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undoInline();
          return;
        }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          redoInline();
          return;
        }
      }

      if (e.key === "r" || e.key === "R") {
        setToolMode((m) => (m === "region" ? "annotate" : "region"));
        return;
      }
      if (e.key === "Escape") {
        setToolMode("annotate");
        return;
      }

      if (toolMode !== "annotate") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prevPage();
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextPage();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toolMode, undoInline, redoInline, prevPage, nextPage]);

  const zoomIn = useCallback(() => {
    const current = getPageDisplaySize(pageNum).scale;
    setFitMode("manual");
    setManualScale(ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  }, [getPageDisplaySize, pageNum]);

  const zoomOut = useCallback(() => {
    const current = getPageDisplaySize(pageNum).scale;
    setFitMode("manual");
    setManualScale([...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0]);
  }, [getPageDisplaySize, pageNum]);

  const pages = useMemo(() => {
    const values: number[] = [];
    for (let p = 1; p <= numPages; p += 1) values.push(p);
    return values;
  }, [numPages]);

  if (error) return <div className={css.state}>Failed to load PDF: {error}</div>;

  return (
    <div className={css.viewer}>
      <div className={css.toolbar}>
        <div className={css.toolbarGroup}>
          <button className={css.navBtn} onClick={prevPage} disabled={pageNum <= 1 || loading}>‹</button>
          <input
            className={css.pageInput}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePageInputSubmit();
            }}
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
                      <DocumentOverlay
                        strokes={strokes.map(toStrokeData)}
                        onStrokeComplete={(stroke) => handleInlineStroke(page, stroke)}
                        onEraseStroke={(id) => handleEraseStroke(page, id)}
                        onSegmentErase={(del, cr) => handleSegmentErase(page, del, cr)}
                        regions={regions}
                        onRegionComplete={(rect) => handleRegionComplete(page, rect)}
                        onRegionClick={(region) => navigate(`/notes/${region.note_id}`)}
                        mode={toolMode}
                        viewBox={viewBox}
                        naturalSize={natural}
                        color={pen.color}
                        penWidth={pen.width}
                        className={css.overlay}
                      />
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
