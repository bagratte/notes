import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { EnrichedRegion } from "./DocumentOverlay";
import type { ToolMode } from "@/types";
import type { StrokeData } from "@/components/Canvas";
import { DEFAULT_PEN_DOCUMENT as DEFAULT_PEN } from "@/components/Toolbar";
import type { PenSettings } from "@/components/Toolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi, notes as notesApi, documents as docsApi } from "@/api";
import type { Stroke } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";
import {
  NaturalSize,
  PendingRegion,
  ViewportSize,
  PanState,
  ZOOM_STEPS,
  WINDOW_BUFFER,
  PAGE_GUTTER,
  PAN_DEADZONE_PX,
  PAGE_FALLBACK_WIDTH,
  PAGE_FALLBACK_HEIGHT,
  getDisplayScale,
} from "./viewerTypes";

export interface UseDocumentViewerResult {
  // refs — shared with viewers for format-specific loading/rendering
  containerRef: React.RefObject<HTMLDivElement>;
  pageRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  canvasRefs: React.MutableRefObject<Map<number, HTMLCanvasElement>>;
  loadedStrokePagesRef: React.MutableRefObject<Set<number>>;
  loadedRegionPagesRef: React.MutableRefObject<Set<number>>;
  sectionNoteCacheRef: React.MutableRefObject<Map<number, number>>;

  // state
  numPages: number;
  pageNum: number;
  pageLabels: string[] | null;
  pageInput: string;
  fitMode: "width" | "page" | "manual";
  fitPopoverOpen: boolean;
  manualScale: number;
  viewport: ViewportSize;
  naturalSizes: Record<number, NaturalSize>;
  strokesByPage: Record<number, Stroke[]>;
  redoByPage: Record<number, Stroke[]>;
  regionsByPage: Record<number, EnrichedRegion[]>;
  loading: boolean;
  error: string | null;
  toolMode: ToolMode;
  pen: PenSettings;
  isPanning: boolean;
  windowRange: { start: number; end: number };
  activeStrokes: Stroke[];
  activeRedo: Stroke[];

  // state setters exposed for viewer loading effects
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setNaturalSizes: React.Dispatch<React.SetStateAction<Record<number, NaturalSize>>>;
  setPageLabels: React.Dispatch<React.SetStateAction<string[] | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setWindowRange: React.Dispatch<React.SetStateAction<{ start: number; end: number }>>;
  setStrokesByPage: React.Dispatch<React.SetStateAction<Record<number, Stroke[]>>>;
  setRedoByPage: React.Dispatch<React.SetStateAction<Record<number, Stroke[]>>>;
  setRegionsByPage: React.Dispatch<React.SetStateAction<Record<number, EnrichedRegion[]>>>;
  setFitMode: React.Dispatch<React.SetStateAction<"width" | "page" | "manual">>;
  setFitPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setManualScale: React.Dispatch<React.SetStateAction<number>>;
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>;
  setPageInput: React.Dispatch<React.SetStateAction<string>>;

  // computed / callbacks
  getPageNaturalSize: (page: number) => NaturalSize;
  getPageDisplaySize: (page: number) => { width: number; height: number; scale: number; natural: NaturalSize };
  updateWindowFromPage: (activePage: number) => void;
  loadPageData: (page: number, force?: boolean) => Promise<void>;
  scrollToPage: (targetPage: number, behavior?: ScrollBehavior) => void;
  syncActivePageFromScroll: () => void;
  handlePageInputSubmit: () => void;
  handleInlineStroke: (page: number, stroke: StrokeData) => Promise<void>;
  undoInline: () => Promise<void>;
  redoInline: () => void;
  handleEraseStroke: (page: number, id: number) => Promise<void>;
  handleSegmentErase: (page: number, deleted: number[], created: StrokeData[]) => Promise<void>;
  handleRegionComplete: (page: number, rect: PendingRegion) => Promise<void>;
  handleRegionAddToNote: (page: number, rect: PendingRegion, noteId: number) => Promise<void>;
  handleRegionUpdate: (page: number, regionId: number, rect: PendingRegion) => Promise<void>;
  handleRegionClick: (region: EnrichedRegion) => void;
  handleRegionDelete: (page: number, region: EnrichedRegion) => Promise<void>;
  stopPointerPan: () => void;
  handleScrollPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerCancel: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  prevPage: () => void;
  nextPage: () => void;

  // drawing settings
  ds: ReturnType<typeof useDrawingSettings>["settings"];
  updateDs: ReturnType<typeof useDrawingSettings>["update"];

  // pen setter (used by ViewerShell's Toolbar)
  setPen: React.Dispatch<React.SetStateAction<PenSettings>>;

  // convenience batch reset for loader effects
  resetForLoad: (initialPage: number) => void;

  // cross-device sync
  remotePage: number | null;
  remotePageUpdatedAt: string | null;
  syncAvailable: boolean;
  handleSync: () => void;
}

interface Options {
  documentId: number;
  folderId?: number;
  initialPage?: number;
  serverLastPage?: number | null;
  serverLastPageUpdatedAt?: string | null;
}

export function useDocumentViewer({ documentId, folderId, initialPage, serverLastPage, serverLastPageUpdatedAt }: Options): UseDocumentViewerResult {
  const navigate = useNavigate();
  const { settings: ds, update: updateDs } = useDrawingSettings();

  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const loadedStrokePagesRef = useRef<Set<number>>(new Set());
  const loadedRegionPagesRef = useRef<Set<number>>(new Set());
  const sectionNoteCacheRef = useRef<Map<number, number>>(new Map());
  const suppressScrollSyncRef = useRef(false);
  const panStateRef = useRef<PanState | null>(null);
  const prevViewportRef = useRef<ViewportSize | null>(null);
  const prevZoomRef = useRef<{ fitMode: string; manualScale: number } | null>(null);
  const lastPageSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // state
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
  const [toolMode, setToolMode] = useState<ToolMode>("auto");
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [isPanning, setIsPanning] = useState(false);
  const [remotePage, setRemotePage] = useState<number | null>(serverLastPage ?? null);
  const [remotePageUpdatedAt, setRemotePageUpdatedAt] = useState<string | null>(serverLastPageUpdatedAt ?? null);
  const [windowRange, setWindowRange] = useState(() => {
    const target = Math.max(1, initialPage ?? 1);
    return { start: Math.max(1, target - WINDOW_BUFFER), end: target + WINDOW_BUFFER };
  });

  const activeStrokes = strokesByPage[pageNum] ?? [];
  const activeRedo = redoByPage[pageNum] ?? [];

  // ---------- convenience reset ----------

  const resetForLoad = useCallback((initPage: number) => {
    const target = Math.max(1, initPage);
    setLoading(true);
    setError(null);
    setNumPages(0);
    setPageNum(target);
    setPageLabels(null);
    setNaturalSizes({});
    setStrokesByPage({});
    setRedoByPage({});
    setRegionsByPage({});
    setWindowRange({ start: Math.max(1, target - WINDOW_BUFFER), end: target + WINDOW_BUFFER });
    loadedStrokePagesRef.current.clear();
    loadedRegionPagesRef.current.clear();
    sectionNoteCacheRef.current.clear();
  }, []);

  // ---------- computed ----------

  const getPageNaturalSize = useCallback(
    (page: number) => naturalSizes[page] ?? { width: PAGE_FALLBACK_WIDTH, height: PAGE_FALLBACK_HEIGHT },
    [naturalSizes]
  );

  const getPageDisplaySize = useCallback(
    (page: number) => {
      const natural = getPageNaturalSize(page);
      const scale = getDisplayScale(fitMode, manualScale, natural, viewport);
      return { width: natural.width * scale, height: natural.height * scale, scale, natural };
    },
    [fitMode, manualScale, viewport, getPageNaturalSize]
  );

  // ---------- window ----------

  const updateWindowFromPage = useCallback(
    (activePage: number) => {
      if (numPages === 0) return;
      const start = Math.max(1, activePage - WINDOW_BUFFER);
      const end = Math.min(numPages, activePage + WINDOW_BUFFER);
      setWindowRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    },
    [numPages]
  );

  // ---------- data loading ----------

  const loadPageData = useCallback(
    async (page: number, force = false) => {
      if (!force && loadedStrokePagesRef.current.has(page) && loadedRegionPagesRef.current.has(page)) return;

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

  // ---------- scroll / navigation ----------

  const scrollToPage = useCallback((targetPage: number, behavior: ScrollBehavior = "smooth") => {
    const clamped = Math.max(1, Math.min(numPages, targetPage));
    setPageNum(clamped);
    const el = pageRefs.current.get(clamped);
    const container = containerRef.current;
    if (!el || !container) return;

    suppressScrollSyncRef.current = true;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = container.scrollTop + (elRect.top - containerRect.top) - PAGE_GUTTER / 2;
    container.scrollTo({ top, behavior });
    window.setTimeout(() => { suppressScrollSyncRef.current = false; }, behavior === "smooth" ? 240 : 0);
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
      if (distance < bestDistance) { bestDistance = distance; bestPage = p; }
    }

    if (bestPage !== pageNum) setPageNum(bestPage);
  }, [numPages, pageNum]);

  const prevPage = useCallback(() => scrollToPage(pageNum - 1), [pageNum, scrollToPage]);
  const nextPage = useCallback(() => scrollToPage(pageNum + 1), [pageNum, scrollToPage]);

  const syncAvailable = remotePage !== null && remotePage !== pageNum;
  const handleSync = useCallback(() => {
    if (remotePage === null) return;
    scrollToPage(remotePage);
  }, [remotePage, scrollToPage]);

  // ---------- page input ----------

  const handlePageInputSubmit = useCallback(() => {
    const raw = pageInput.trim();
    if (pageLabels) {
      const idx = pageLabels.findIndex((label) => label.toLowerCase() === raw.toLowerCase());
      if (idx >= 0) { scrollToPage(idx + 1); return; }
    }
    const numeric = parseInt(raw, 10);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= numPages) { scrollToPage(numeric); return; }
    setPageInput(pageLabels ? pageLabels[pageNum - 1] || String(pageNum) : String(pageNum));
  }, [pageInput, pageLabels, pageNum, numPages, scrollToPage]);

  // ---------- strokes ----------

  const handleInlineStroke = useCallback(async (page: number, stroke: StrokeData) => {
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
  }, [documentId]);

  const undoInline = useCallback(async () => {
    const page = pageNum;
    const pageStrokes = strokesByPage[page] ?? [];
    if (pageStrokes.length === 0) return;

    const last = pageStrokes[pageStrokes.length - 1];
    if (last.id < 0) return;

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
    setStrokesByPage((prev) => {
      const current = prev[page] ?? [];
      const next = current.filter((s) => !deleted.includes(s.id!));
      lastStrokeErased = next.length === 0 && current.length > 0 && created.length === 0;
      const optimistic: Stroke[] = created.map((s, i) => ({
        id: tempIds[i], section_id: null, document_id: documentId,
        page_number: page, points: s.points, color: s.color, width: s.width,
        created_at: new Date().toISOString(),
      }));
      return { ...prev, [page]: [...next, ...optimistic] };
    });

    await Promise.all(deleted.map((id) => strokesApi.delete(id)));

    if (created.length > 0) {
      const saved = await strokesApi.createBatch(created.map((s) => ({
        section_id: null, document_id: documentId, page_number: page,
        points: s.points, color: s.color, width: s.width,
      })));
      setStrokesByPage((prev) => {
        const without = (prev[page] ?? []).filter((s) => !tempIds.includes(s.id));
        return { ...prev, [page]: [...without, ...saved] };
      });
    }

    if (lastStrokeErased) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId]);

  // ---------- regions ----------

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
    setToolMode("hand");
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate(`/notes/${note.id}`);
  }, [documentId, folderId, navigate]);

  const handleRegionAddToNote = useCallback(async (page: number, rect: PendingRegion, noteId: number) => {
    const existingSections = await sectionsApi.list(noteId);
    const section = await sectionsApi.create(noteId, existingSections.length);

    const region = await regionsApi.create({
      documentId,
      sectionId: section.id,
      pageNumber: page,
      ...rect,
    });

    setRegionsByPage((prev) => {
      const existing = prev[page] ?? [];
      return { ...prev, [page]: [...existing, { ...region, note_id: noteId }] };
    });

    sectionNoteCacheRef.current.set(section.id, noteId);
    loadedRegionPagesRef.current.add(page);
    setToolMode("hand");
    navigate(`/notes/${noteId}`);
  }, [documentId, navigate]);

  const handleRegionUpdate = useCallback(async (page: number, regionId: number, rect: PendingRegion) => {
    let previousRegion: EnrichedRegion | null = null;

    setRegionsByPage((prev) => {
      const existing = prev[page] ?? [];
      previousRegion = existing.find((r) => r.id === regionId) ?? null;
      if (previousRegion === null) return prev;
      return { ...prev, [page]: existing.map((r) => (r.id === regionId ? { ...r, ...rect } : r)) };
    });

    if (previousRegion === null) return;

    try {
      const saved = await regionsApi.update(regionId, rect);
      setRegionsByPage((prev) => {
        const existing = prev[page] ?? [];
        return { ...prev, [page]: existing.map((r) => (r.id === regionId ? { ...r, ...saved } : r)) };
      });
    } catch {
      const rollback = previousRegion;
      setRegionsByPage((prev) => {
        const existing = prev[page] ?? [];
        return { ...prev, [page]: existing.map((r) => (r.id === regionId ? rollback : r)) };
      });
    }
  }, []);

  const handleRegionClick = useCallback((region: EnrichedRegion) => {
    navigate(`/notes/${region.note_id}`);
  }, [navigate]);

  const handleRegionDelete = useCallback(async (page: number, region: EnrichedRegion) => {
    setRegionsByPage((prev) => ({
      ...prev,
      [page]: (prev[page] ?? []).filter((r) => r.id !== region.id),
    }));
    try {
      await notesApi.delete(region.note_id);
      window.dispatchEvent(new CustomEvent("note:deleted", { detail: { noteId: region.note_id } }));
      window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    } catch {
      setRegionsByPage((prev) => ({
        ...prev,
        [page]: [...(prev[page] ?? []), region],
      }));
    }
  }, []);

  // ---------- pan ----------

  const stopPointerPan = useCallback(() => {
    if (panStateRef.current) { panStateRef.current = null; setIsPanning(false); }
  }, []);

  const handleScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== "hand") return;
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

  const handleScrollPointerCancel = useCallback(() => { stopPointerPan(); }, [stopPointerPan]);

  // ---------- zoom ----------

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

  // ---------- effects ----------

  // persist current page locally and sync to server (debounced)
  useEffect(() => {
    if (numPages === 0) return;
    localStorage.setItem(`doc:${documentId}:page`, String(pageNum));
    if (lastPageSaveTimerRef.current) clearTimeout(lastPageSaveTimerRef.current);
    lastPageSaveTimerRef.current = setTimeout(() => {
      docsApi.updateLastPage(documentId, pageNum).then((updated) => {
        setRemotePage(updated.last_page);
        setRemotePageUpdatedAt(updated.last_page_updated_at);
      }).catch(() => {});
    }, 1500);
  }, [documentId, pageNum, numPages]);

  // poll server for remote last_page (on tab focus + every 60 s)
  useEffect(() => {
    const poll = () => {
      docsApi.get(documentId).then((updated) => {
        setRemotePage(updated.last_page);
        setRemotePageUpdatedAt(updated.last_page_updated_at);
      }).catch(() => {});
    };
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(poll, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
      if (lastPageSaveTimerRef.current) clearTimeout(lastPageSaveTimerRef.current);
    };
  }, [documentId]);

  // viewport resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // re-center on container resize
  useEffect(() => {
    const prev = prevViewportRef.current;
    prevViewportRef.current = viewport;
    if (!prev || (prev.width === viewport.width && prev.height === viewport.height)) return;
    if (numPages === 0) return;
    const currentPage = pageNum;
    window.requestAnimationFrame(() => { scrollToPage(currentPage, "auto"); });
  }, [viewport, numPages, pageNum, scrollToPage]);

  // re-center on zoom change
  useEffect(() => {
    if (numPages === 0) return;
    const prev = prevZoomRef.current;
    prevZoomRef.current = { fitMode, manualScale };
    if (prev && prev.fitMode === fitMode && prev.manualScale === manualScale) return;
    const currentPage = pageNum;
    window.requestAnimationFrame(() => { scrollToPage(currentPage, "auto"); });
  }, [manualScale, fitMode, numPages, pageNum, scrollToPage]);

  // page input sync
  useEffect(() => {
    setPageInput(pageLabels ? pageLabels[pageNum - 1] || String(pageNum) : String(pageNum));
  }, [pageNum, pageLabels]);

  // update buffered window
  useEffect(() => {
    updateWindowFromPage(pageNum);
  }, [pageNum, updateWindowFromPage]);

  // scroll sync listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { syncActivePageFromScroll(); });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [numPages, syncActivePageFromScroll]);

  // remove regions whose linked note was deleted elsewhere (e.g. sidebar)
  useEffect(() => {
    const handler = (e: Event) => {
      const { noteId } = (e as CustomEvent<{ noteId: number }>).detail;
      setRegionsByPage((prev) => {
        const next: Record<number, EnrichedRegion[]> = {};
        for (const [page, rs] of Object.entries(prev)) {
          next[Number(page)] = rs.filter((r) => r.note_id !== noteId);
        }
        return next;
      });
    };
    window.addEventListener("note:deleted", handler);
    return () => window.removeEventListener("note:deleted", handler);
  }, []);

  // jump to initial page after layout
  useEffect(() => {
    if (numPages === 0) return;
    const target = Math.max(1, Math.min(numPages, initialPage ?? 1));
    window.requestAnimationFrame(() => { scrollToPage(target, "auto"); });
  }, [numPages, initialPage, scrollToPage]);

  return {
    containerRef,
    pageRefs,
    canvasRefs,
    loadedStrokePagesRef,
    loadedRegionPagesRef,
    sectionNoteCacheRef,
    numPages,
    pageNum,
    pageLabels,
    pageInput,
    fitMode,
    fitPopoverOpen,
    manualScale,
    viewport,
    naturalSizes,
    strokesByPage,
    redoByPage,
    regionsByPage,
    loading,
    error,
    toolMode,
    pen,
    isPanning,
    windowRange,
    activeStrokes,
    activeRedo,
    setNumPages,
    setNaturalSizes,
    setPageLabels,
    setLoading,
    setError,
    setWindowRange,
    setStrokesByPage,
    setRedoByPage,
    setRegionsByPage,
    setFitMode,
    setFitPopoverOpen,
    setManualScale,
    setToolMode,
    setPageInput,
    getPageNaturalSize,
    getPageDisplaySize,
    updateWindowFromPage,
    loadPageData,
    scrollToPage,
    syncActivePageFromScroll,
    handlePageInputSubmit,
    handleInlineStroke,
    undoInline,
    redoInline,
    handleEraseStroke,
    handleSegmentErase,
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
    prevPage,
    nextPage,
    ds,
    updateDs,
    resetForLoad,
    setPen,
    remotePage,
    remotePageUpdatedAt,
    syncAvailable,
    handleSync,
  };
}
