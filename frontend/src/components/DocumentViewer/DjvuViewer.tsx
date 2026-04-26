import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DocumentOverlay from "./DocumentOverlay";
import type { EnrichedRegion, ToolMode } from "./DocumentOverlay";
import type { StrokeData } from "@/components/Canvas";
import { PenToolbar, DEFAULT_PEN } from "@/components/PenToolbar";
import type { PenSettings } from "@/components/PenToolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi, notes as notesApi } from "@/api";
import type { Stroke } from "@/types";
import { useTouchMode } from "@/context/TouchMode";
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

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
const WINDOW_BUFFER = 2;
const PAGE_GUTTER = 16;

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

export default function DjvuViewer({ url, documentId, folderId, initialPage }: Props) {
  const navigate = useNavigate();
  const { isTouch } = useTouchMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<DjVuDocument | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const loadingRastersRef = useRef<Set<number>>(new Set());
  const loadedStrokePagesRef = useRef<Set<number>>(new Set());
  const loadedRegionPagesRef = useRef<Set<number>>(new Set());
  const sectionNoteCacheRef = useRef<Map<number, number>>(new Map());
  const suppressScrollSyncRef = useRef(false);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(() => Math.max(1, initialPage ?? 1));
  const [pageInput, setPageInput] = useState("");
  const [fitMode, setFitMode] = useState<"width" | "page" | "manual">("width");
  const [manualScale, setManualScale] = useState(1.0);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 1200, height: 900 });
  const [naturalSizes, setNaturalSizes] = useState<Record<number, NaturalSize>>({});
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [redoByPage, setRedoByPage] = useState<Record<number, Stroke[]>>({});
  const [regionsByPage, setRegionsByPage] = useState<Record<number, EnrichedRegion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>(() => (localStorage.getItem("touchMode") === "true" ? "view" : "annotate"));
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);

  const [windowRange, setWindowRange] = useState(() => ({ start: 1, end: Math.max(1, initialPage ?? 1) }));

  const activeStrokes = strokesByPage[pageNum] ?? [];
  const activeRedo = redoByPage[pageNum] ?? [];

  const getPageNaturalSize = useCallback(
    (page: number) => naturalSizes[page] ?? { width: 900, height: 1200 },
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
          if (cached !== undefined) return { ...r, note_id: cached };
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

  const renderDjvuPage = useCallback(async (page: number) => {
    const doc = docRef.current;
    const canvas = canvasRefs.current.get(page);
    const natural = naturalSizes[page];
    if (!doc || !canvas || !natural || loadingRastersRef.current.has(page)) return;

    loadingRastersRef.current.add(page);
    try {
      const djvuPage = await doc.getPage(page);
      const { width, height } = getPageDisplaySize(page);

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);

      const imageData = djvuPage.getImageData();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const offscreen = document.createElement("canvas");
      offscreen.width = imageData.width;
      offscreen.height = imageData.height;
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) return;
      offscreenCtx.putImageData(imageData, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
      djvuPage.reset();
    } finally {
      loadingRastersRef.current.delete(page);
    }
  }, [getPageDisplaySize, naturalSizes]);

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

    if (bestPage !== pageNum) setPageNum(bestPage);
  }, [numPages, pageNum]);

  // load document
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setNumPages(0);
    setPageNum(Math.max(1, initialPage ?? 1));
    setPageInput("");
    setNaturalSizes({});
    setStrokesByPage({});
    setRedoByPage({});
    setRegionsByPage({});
    setWindowRange({ start: 1, end: Math.max(1, initialPage ?? 1) });

    loadedStrokePagesRef.current.clear();
    loadedRegionPagesRef.current.clear();
    sectionNoteCacheRef.current.clear();
    loadingRastersRef.current.clear();

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const doc = new DjVu.Document(buffer);
        docRef.current = doc;
        const count = doc.getPagesQuantity();
        const sizes = doc.getPagesSizes();

        const byPage: Record<number, NaturalSize> = {};
        sizes.forEach((size, idx) => {
          byPage[idx + 1] = { width: size.width, height: size.height };
        });

        setNaturalSizes(byPage);
        setNumPages(count);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      docRef.current = null;
    };
  }, [url, initialPage]);

  // keep viewport size up to date
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

  useEffect(() => {
    setPageInput(String(pageNum));
  }, [pageNum]);

  useEffect(() => {
    if (isTouch) {
      setToolMode("view");
    }
  }, [isTouch]);

  useEffect(() => {
    updateWindowFromPage(pageNum);
  }, [pageNum, updateWindowFromPage]);

  useEffect(() => {
    if (numPages === 0) return;

    const pages: number[] = [];
    for (let p = windowRange.start; p <= windowRange.end; p += 1) pages.push(p);

    pages.forEach((page) => {
      void loadPageData(page);
      void renderDjvuPage(page);
    });
  }, [numPages, windowRange, loadPageData, renderDjvuPage, fitMode, manualScale, viewport]);

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

  useEffect(() => {
    if (numPages === 0) return;
    const target = Math.max(1, Math.min(numPages, initialPage ?? 1));
    window.requestAnimationFrame(() => {
      scrollToPage(target, "auto");
    });
  }, [numPages, initialPage, scrollToPage]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      if (detail.documentId !== documentId) return;
      void loadPageData(detail.pageNumber, true);
      void renderDjvuPage(detail.pageNumber);
    };

    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, [documentId, loadPageData, renderDjvuPage]);

  const handlePageInputSubmit = useCallback(() => {
    const n = parseInt(pageInput.trim(), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= numPages) {
      scrollToPage(n);
      return;
    }
    setPageInput(String(pageNum));
  }, [pageInput, pageNum, numPages, scrollToPage]);

  const handleInlineStroke = useCallback(async (page: number, stroke: StrokeData) => {
    const saved = await strokesApi.create({
      section_id: null,
      document_id: documentId,
      page_number: page,
      points: stroke.points,
      color: stroke.color,
      width: stroke.width,
    });

    setStrokesByPage((prev) => {
      const existing = prev[page] ?? [];
      if (existing.length === 0) {
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
          detail: { documentId, pageNumber: page },
        }));
      }
      return { ...prev, [page]: [...existing, saved] };
    });

    setRedoByPage((prev) => ({ ...prev, [page]: [] }));
    loadedStrokePagesRef.current.add(page);
  }, [documentId]);

  const undoInline = useCallback(() => {
    const page = pageNum;
    const pageStrokes = strokesByPage[page] ?? [];
    if (pageStrokes.length === 0) return;

    const last = pageStrokes[pageStrokes.length - 1];
    void strokesApi.delete(last.id);

    setStrokesByPage((prev) => ({ ...prev, [page]: pageStrokes.slice(0, -1) }));
    setRedoByPage((prev) => ({ ...prev, [page]: [...(prev[page] ?? []), last] }));

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

  const handleEraseStroke = useCallback((page: number, id: number) => {
    setStrokesByPage((prev) => {
      const current = prev[page] ?? [];
      const stroke = current.find((s) => s.id === id);
      if (!stroke) return prev;

      void strokesApi.delete(id);
      const next = current.filter((s) => s.id !== id);
      if (next.length === 0) {
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
          detail: { documentId, pageNumber: page },
        }));
      }

      return { ...prev, [page]: next };
    });
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

  if (error) return <div className={css.state}>Failed to load DjVu: {error}</div>;

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
          <span className={css.zoomLevel}>
            {fitMode === "width" ? "width" : fitMode === "page" ? "page" : `${Math.round(manualScale * 100)}%`}
          </span>
          <button className={css.zoomBtn} onClick={zoomIn} disabled={loading}>+</button>
          <button
            className={`${css.zoomBtn}${fitMode === "width" ? ` ${css.active}` : ""}`}
            onClick={() => setFitMode("width")}
            title="Fit width"
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4v8M14 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M2 8h5M14 8H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M5 6L2 8l3 2M11 6l3 2-3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className={`${css.zoomBtn}${fitMode === "page" ? ` ${css.active}` : ""}`}
            onClick={() => setFitMode("page")}
            title="Fit page"
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="5" y="4" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 1h3v3M1 1l3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 1h-3v3M15 1l-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 15h3v-3M1 15l3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 15h-3v-3M15 15l-3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
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
            if (toolMode !== "annotate") setToolMode("annotate");
          }}
          onModeChange={(mode) => setToolMode(mode === "hand" ? "view" : mode)}
          canUndo={activeStrokes.length > 0}
          canRedo={activeRedo.length > 0}
          onUndo={undoInline}
          onRedo={redoInline}
        />
      </div>

      <div ref={containerRef} className={css.scroll}>
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
