import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ToolMode } from "@/types";
import type { StrokeData } from "@/components/Canvas";
import { DEFAULT_PEN_DOCUMENT as DEFAULT_PEN } from "@/components/Toolbar";
import type { PenSettings } from "@/components/Toolbar";
import { strokes as strokesApi, regions as regionsApi, sections as sectionsApi, notes as notesApi, documents as docsApi } from "@/api";
import type { Stroke, DocUndoEntry, Region } from "@/types";
import { useDrawingSettings } from "@/context/DrawingSettings";
import {
  NaturalSize,
  PendingRegion,
  ViewportSize,
  PanState,
  TocEntry,
  ZOOM_STEPS,
  WINDOW_BUFFER,
  PAGE_GUTTER,
  PAN_DEADZONE_PX,
  PAGE_FALLBACK_WIDTH,
  PAGE_FALLBACK_HEIGHT,
  getDisplayScale,
  computeContentBounds,
} from "./viewerTypes";

export interface UseDocumentViewerResult {
  // refs — shared with viewers for format-specific loading/rendering
  containerRef: React.RefObject<HTMLDivElement>;
  pageRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  canvasRefs: React.MutableRefObject<Map<number, HTMLCanvasElement>>;
  textLayerRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  loadedStrokePagesRef: React.MutableRefObject<Set<number>>;
  loadedRegionPagesRef: React.MutableRefObject<Set<number>>;

  // state
  numPages: number;
  pageNum: number;
  pageLabels: string[] | null;
  pageInput: string;
  fitMode: "width" | "page" | "manual";
  fitPopoverOpen: boolean;
  manualScale: number;
  zoomInput: string;
  viewport: ViewportSize;
  naturalSizes: Record<number, NaturalSize>;
  strokesByPage: Record<number, Stroke[]>;
  redoByPage: Record<number, DocUndoEntry[]>;
  regionsByPage: Record<number, Region[]>;
  loading: boolean;
  error: string | null;
  toolMode: ToolMode;
  pen: PenSettings;
  isPanning: boolean;
  windowRange: { start: number; end: number };
  activeStrokes: Stroke[];
  activeRedo: DocUndoEntry[];
  activeUndo: DocUndoEntry[];

  // state setters exposed for viewer loading effects
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setNaturalSizes: React.Dispatch<React.SetStateAction<Record<number, NaturalSize>>>;
  setPageLabels: React.Dispatch<React.SetStateAction<string[] | null>>;
  toc: TocEntry[];
  setToc: React.Dispatch<React.SetStateAction<TocEntry[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setWindowRange: React.Dispatch<React.SetStateAction<{ start: number; end: number }>>;
  setStrokesByPage: React.Dispatch<React.SetStateAction<Record<number, Stroke[]>>>;
  setRedoByPage: React.Dispatch<React.SetStateAction<Record<number, DocUndoEntry[]>>>;
  setRegionsByPage: React.Dispatch<React.SetStateAction<Record<number, Region[]>>>;
  setFitMode: React.Dispatch<React.SetStateAction<"width" | "page" | "manual">>;
  setFitPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setManualScale: React.Dispatch<React.SetStateAction<number>>;
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>;
  setPageInput: React.Dispatch<React.SetStateAction<string>>;
  setZoomInput: React.Dispatch<React.SetStateAction<string>>;

  // computed / callbacks
  getPageNaturalSize: (page: number) => NaturalSize;
  getPageDisplaySize: (page: number) => { width: number; height: number; scale: number; natural: NaturalSize };
  updateWindowFromPage: (activePage: number) => void;
  loadPageData: (page: number, force?: boolean) => Promise<void>;
  scrollToPage: (targetPage: number, behavior?: ScrollBehavior) => void;
  syncActivePageFromScroll: () => void;
  handlePageInputSubmit: () => void;
  handleZoomInputSubmit: () => void;
  handleInlineStroke: (page: number, stroke: StrokeData) => Promise<void>;
  undoInline: () => Promise<void>;
  redoInline: () => void;
  handleEraseStroke: (page: number, id: number) => Promise<void>;
  handleSegmentErase: (page: number, deleted: number[], created: StrokeData[]) => Promise<void>;
  handleBatchDeleteInline: (page: number, toDelete: StrokeData[]) => Promise<void>;
  handleBatchMoveInline: (page: number, deleted: StrokeData[], created: StrokeData[]) => Promise<void>;
  handleRegionComplete: (page: number, rect: PendingRegion) => Promise<void>;
  handleRegionAddToNote: (page: number, rect: PendingRegion, noteId: number) => Promise<void>;
  handleRegionUpdate: (page: number, regionId: number, rect: PendingRegion) => Promise<void>;
  handleOpenNote: (noteId: number) => void;
  handleRegionLinkNewNote: (region: Region) => Promise<void>;
  handleRegionLinkExistingNote: (region: Region, noteId: number) => Promise<void>;
  stopPointerPan: () => void;
  handleScrollPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleScrollPointerCancel: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToContentWidth: () => void;
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
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadedStrokePagesRef = useRef<Set<number>>(new Set());
  const loadedRegionPagesRef = useRef<Set<number>>(new Set());
  const suppressScrollSyncRef = useRef(false);
  const panStateRef = useRef<PanState | null>(null);
  const prevViewportRef = useRef<ViewportSize | null>(null);
  const prevZoomRef = useRef<{ fitMode: string; manualScale: number } | null>(null);
  const lastPageSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // state
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(() => Math.max(1, initialPage ?? 1));
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [pageInput, setPageInput] = useState("");
  const [fitMode, setFitMode] = useState<"width" | "page" | "manual">("width");
  const [fitPopoverOpen, setFitPopoverOpen] = useState(false);
  const [manualScale, setManualScale] = useState(1.0);
  const [zoomInput, setZoomInput] = useState("100");
  const [viewport, setViewport] = useState<ViewportSize>({ width: 1200, height: 900 });
  const [naturalSizes, setNaturalSizes] = useState<Record<number, NaturalSize>>({});
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [redoByPage, setRedoByPage] = useState<Record<number, DocUndoEntry[]>>({});
  const [undoByPage, setUndoByPage] = useState<Record<number, DocUndoEntry[]>>({});
  const [regionsByPage, setRegionsByPage] = useState<Record<number, Region[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("auto");
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [isPanning, setIsPanning] = useState(false);
  const [remotePage, setRemotePage] = useState<number | null>(serverLastPage ?? null);
  const [remotePageUpdatedAt, setRemotePageUpdatedAt] = useState<string | null>(serverLastPageUpdatedAt ?? null);
  const [hasPendingWrite, setHasPendingWrite] = useState(false);
  const [windowRange, setWindowRange] = useState(() => {
    const target = Math.max(1, initialPage ?? 1);
    return { start: Math.max(1, target - WINDOW_BUFFER), end: target + WINDOW_BUFFER };
  });

  const activeStrokes = strokesByPage[pageNum] ?? [];
  const activeRedo = redoByPage[pageNum] ?? [];
  const activeUndo = undoByPage[pageNum] ?? [];

  // ---------- convenience reset ----------

  const resetForLoad = useCallback((initPage: number) => {
    const target = Math.max(1, initPage);
    setLoading(true);
    setError(null);
    setNumPages(0);
    setPageNum(target);
    setPageLabels(null);
    setToc([]);
    setNaturalSizes({});
    setStrokesByPage({});
    setRedoByPage({});
    setUndoByPage({});
    setRegionsByPage({});
    setWindowRange({ start: Math.max(1, target - WINDOW_BUFFER), end: target + WINDOW_BUFFER });
    loadedStrokePagesRef.current.clear();
    loadedRegionPagesRef.current.clear();
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

      const [strokeData, regionsData] = await Promise.all([
        strokesApi.listForPage(documentId, page),
        regionsApi.list({ documentId, pageNumber: page }),
      ]);

      setStrokesByPage((prev) => ({ ...prev, [page]: strokeData }));
      setRedoByPage((prev) => (prev[page] ? { ...prev, [page]: [] } : prev));
      setUndoByPage((prev) => (prev[page] ? { ...prev, [page]: [] } : prev));
      loadedStrokePagesRef.current.add(page);

      setRegionsByPage((prev) => ({ ...prev, [page]: regionsData }));
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

  const prevPage = useCallback(() => scrollToPage(pageNum - 1, "instant"), [pageNum, scrollToPage]);
  const nextPage = useCallback(() => scrollToPage(pageNum + 1, "instant"), [pageNum, scrollToPage]);

  const syncAvailable = remotePage !== null && remotePage !== pageNum && !hasPendingWrite;
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

  // ---------- zoom input ----------

  const handleZoomInputSubmit = useCallback(() => {
    const parsed = parseFloat(zoomInput);
    const min = ZOOM_STEPS[0] * 100;
    const max = ZOOM_STEPS[ZOOM_STEPS.length - 1] * 100;
    if (!Number.isNaN(parsed) && parsed > 0) {
      const clamped = Math.min(max, Math.max(min, parsed));
      setFitMode("manual");
      setManualScale(clamped / 100);
    } else {
      setZoomInput(String(Math.round(getPageDisplaySize(pageNum).scale * 100)));
    }
  }, [zoomInput, getPageDisplaySize, pageNum]);

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
    setUndoByPage((prev) => ({
      ...prev,
      [page]: [...(prev[page] ?? []), { kind: "stroke", stroke: saved }],
    }));

    if (firstStroke) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId]);

  const undoInline = useCallback(async () => {
    const page = pageNum;
    const undoList = undoByPage[page] ?? [];
    if (undoList.length === 0) return;

    const entry = undoList[undoList.length - 1];
    setUndoByPage((prev) => ({ ...prev, [page]: undoList.slice(0, -1) }));

    if (entry.kind === "stroke") {
      const stroke = entry.stroke;
      let wasLast = false;
      setStrokesByPage((prev) => {
        const current = prev[page] ?? [];
        const next = current.filter((s) => s.id !== stroke.id);
        wasLast = next.length === 0 && current.length > 0;
        return { ...prev, [page]: next };
      });
      setRedoByPage((prev) => ({ ...prev, [page]: [...(prev[page] ?? []), entry] }));
      await strokesApi.delete(stroke.id);
      if (wasLast) {
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
          detail: { documentId, pageNumber: page },
        }));
      }
    } else if (entry.kind === "batch-delete") {
      const saved = await strokesApi.createBatch(
        entry.strokes.map((s) => ({
          section_id: null, document_id: documentId, page_number: page,
          points: s.points, color: s.color, width: s.width,
        }))
      );
      let firstStrokes = false;
      setStrokesByPage((prev) => {
        const current = prev[page] ?? [];
        firstStrokes = current.length === 0 && saved.length > 0;
        return { ...prev, [page]: [...current, ...saved] };
      });
      setRedoByPage((prev) => ({
        ...prev,
        [page]: [...(prev[page] ?? []), { kind: "batch-delete", strokes: saved }],
      }));
      if (firstStrokes) {
        window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
          detail: { documentId, pageNumber: page },
        }));
      }
    } else if (entry.kind === "batch-move") {
      await Promise.all(entry.created.map((s) => strokesApi.delete(s.id)));
      const saved = await strokesApi.createBatch(
        entry.deleted.map((s) => ({
          section_id: null, document_id: documentId, page_number: page,
          points: s.points, color: s.color, width: s.width,
        }))
      );
      setStrokesByPage((prev) => {
        const createdIds = new Set(entry.created.map((s) => s.id));
        return { ...prev, [page]: [...(prev[page] ?? []).filter((s) => !createdIds.has(s.id)), ...saved] };
      });
      setRedoByPage((prev) => ({
        ...prev,
        [page]: [...(prev[page] ?? []), { kind: "batch-move", deleted: saved, created: entry.created }],
      }));
    }
  }, [documentId, pageNum, undoByPage]);

  const redoInline = useCallback(() => {
    const page = pageNum;
    const redoList = redoByPage[page] ?? [];
    if (redoList.length === 0) return;

    const entry = redoList[redoList.length - 1];
    setRedoByPage((prev) => ({ ...prev, [page]: redoList.slice(0, -1) }));

    if (entry.kind === "stroke") {
      const last = entry.stroke;
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
          setUndoByPage((prev) => ({
            ...prev,
            [page]: [...(prev[page] ?? []), { kind: "stroke", stroke: saved }],
          }));
          loadedStrokePagesRef.current.add(page);
        });
    } else if (entry.kind === "batch-delete") {
      void Promise.all(entry.strokes.map((s) => strokesApi.delete(s.id))).then(() => {
        let wasLast = false;
        setStrokesByPage((prev) => {
          const ids = new Set(entry.strokes.map((s) => s.id));
          const next = (prev[page] ?? []).filter((s) => !ids.has(s.id));
          wasLast = next.length === 0 && (prev[page] ?? []).length > 0;
          return { ...prev, [page]: next };
        });
        setUndoByPage((prev) => ({
          ...prev,
          [page]: [...(prev[page] ?? []), { kind: "batch-delete", strokes: entry.strokes }],
        }));
        if (wasLast) {
          window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
            detail: { documentId, pageNumber: page },
          }));
        }
      });
    } else if (entry.kind === "batch-move") {
      void Promise.all(entry.deleted.map((s) => strokesApi.delete(s.id))).then(async () => {
        const saved = await strokesApi.createBatch(
          entry.created.map((s) => ({
            section_id: null, document_id: documentId, page_number: page,
            points: s.points, color: s.color, width: s.width,
          }))
        );
        setStrokesByPage((prev) => {
          const ids = new Set(entry.deleted.map((s) => s.id));
          return { ...prev, [page]: [...(prev[page] ?? []).filter((s) => !ids.has(s.id)), ...saved] };
        });
        setUndoByPage((prev) => ({
          ...prev,
          [page]: [...(prev[page] ?? []), { kind: "batch-move", deleted: saved, created: entry.deleted }],
        }));
      });
    }
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

  const handleBatchDeleteInline = useCallback(async (page: number, toDelete: StrokeData[]) => {
    const ids = new Set(toDelete.map((s) => s.id!));
    let wasLast = false;
    setStrokesByPage((prev) => {
      const current = prev[page] ?? [];
      const next = current.filter((s) => !ids.has(s.id));
      wasLast = next.length === 0 && current.length > 0;
      return { ...prev, [page]: next };
    });
    setRedoByPage((prev) => ({ ...prev, [page]: [] }));

    const deletedStrokes: Stroke[] = toDelete.map((s) => ({
      id: s.id!, section_id: null, document_id: documentId, page_number: page,
      points: s.points, color: s.color, width: s.width, created_at: "",
    }));

    await Promise.all(toDelete.map((s) => strokesApi.delete(s.id!)));

    setUndoByPage((prev) => ({
      ...prev,
      [page]: [...(prev[page] ?? []), { kind: "batch-delete", strokes: deletedStrokes }],
    }));

    if (wasLast) {
      window.dispatchEvent(new CustomEvent("document:page-strokes-changed", {
        detail: { documentId, pageNumber: page },
      }));
    }
  }, [documentId]);

  const handleBatchMoveInline = useCallback(async (page: number, deleted: StrokeData[], created: StrokeData[]) => {
    const deletedIds = new Set(deleted.map((s) => s.id!));
    const tempIds = created.map((_, i) => -(Date.now() + i + 1));

    setStrokesByPage((prev) => {
      const current = (prev[page] ?? []).filter((s) => !deletedIds.has(s.id));
      const optimistic: Stroke[] = created.map((s, i) => ({
        id: tempIds[i], section_id: null, document_id: documentId, page_number: page,
        points: s.points, color: s.color, width: s.width, created_at: new Date().toISOString(),
      }));
      return { ...prev, [page]: [...current, ...optimistic] };
    });
    setRedoByPage((prev) => ({ ...prev, [page]: [] }));

    const deletedStrokes: Stroke[] = deleted.map((s) => ({
      id: s.id!, section_id: null, document_id: documentId, page_number: page,
      points: s.points, color: s.color, width: s.width, created_at: "",
    }));

    await Promise.all(deleted.map((s) => strokesApi.delete(s.id!)));

    const savedMoved = await strokesApi.createBatch(
      created.map((s) => ({
        section_id: null, document_id: documentId, page_number: page,
        points: s.points, color: s.color, width: s.width,
      }))
    );

    setStrokesByPage((prev) => {
      const without = (prev[page] ?? []).filter((s) => !tempIds.includes(s.id));
      return { ...prev, [page]: [...without, ...savedMoved] };
    });

    setUndoByPage((prev) => ({
      ...prev,
      [page]: [...(prev[page] ?? []), { kind: "batch-move", deleted: deletedStrokes, created: savedMoved }],
    }));
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
      return { ...prev, [page]: [...existing, region] };
    });

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
      return { ...prev, [page]: [...existing, region] };
    });

    loadedRegionPagesRef.current.add(page);
    setToolMode("hand");
    navigate(`/notes/${noteId}`);
  }, [documentId, navigate]);

  const handleRegionLinkNewNote = useCallback(async (region: Region) => {
    const note = await notesApi.create("Untitled Note", folderId);
    const section = await sectionsApi.create(note.id, 0);
    const updated = await regionsApi.linkSection(region.id, section.id);

    setRegionsByPage((prev) => {
      const page = region.page_number;
      const existing = prev[page] ?? [];
      return { ...prev, [page]: existing.map((r) => (r.id === region.id ? updated : r)) };
    });

    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    navigate(`/notes/${note.id}`);
  }, [folderId, navigate]);

  const handleRegionLinkExistingNote = useCallback(async (region: Region, noteId: number) => {
    const existingSections = await sectionsApi.list(noteId);
    const section = await sectionsApi.create(noteId, existingSections.length);
    const updated = await regionsApi.linkSection(region.id, section.id);

    setRegionsByPage((prev) => {
      const page = region.page_number;
      const existing = prev[page] ?? [];
      return { ...prev, [page]: existing.map((r) => (r.id === region.id ? updated : r)) };
    });

    navigate(`/notes/${noteId}`);
  }, [navigate]);

  const handleRegionUpdate = useCallback(async (page: number, regionId: number, rect: PendingRegion) => {
    let previousRegion: Region | null = null;

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

  const handleOpenNote = useCallback((noteId: number) => {
    navigate(`/notes/${noteId}`);
  }, [navigate]);

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

  // fits to the visible content width of the current page (detected from its rendered
  // canvas), ignoring blank margins; computed once per click and held as a manual scale
  const fitToContentWidth = useCallback(() => {
    const canvas = canvasRefs.current.get(pageNum);
    const container = containerRef.current;
    if (!canvas || !container) return;

    const bounds = computeContentBounds(canvas);
    if (!bounds) { setFitMode("width"); return; }

    const natural = getPageNaturalSize(pageNum);
    const naturalPerPx = natural.width / canvas.width;
    const padding = natural.width * 0.01;
    const contentMinX = Math.max(0, bounds.minX * naturalPerPx - padding);
    const contentMaxX = Math.min(natural.width, bounds.maxX * naturalPerPx + padding);
    const contentWidth = Math.max(1, contentMaxX - contentMinX);

    const containerWidth = Math.max(400, viewport.width - 16);
    const newScale = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], containerWidth / contentWidth);

    setFitMode("manual");
    setManualScale(newScale);

    const targetScrollLeft = Math.max(0, contentMinX * newScale - PAGE_GUTTER);
    window.requestAnimationFrame(() => {
      if (containerRef.current) containerRef.current.scrollLeft = targetScrollLeft;
    });
  }, [pageNum, viewport, getPageNaturalSize]);

  // ---------- effects ----------

  // suppress sync button immediately (before paint) whenever page changes
  useLayoutEffect(() => {
    if (numPages === 0) return;
    setHasPendingWrite(true);
  }, [pageNum, numPages]);

  // persist current page locally and sync to server (debounced)
  useEffect(() => {
    if (numPages === 0) return;
    localStorage.setItem(`doc:${documentId}:page`, String(pageNum));
    if (lastPageSaveTimerRef.current) clearTimeout(lastPageSaveTimerRef.current);
    lastPageSaveTimerRef.current = setTimeout(() => {
      setHasPendingWrite(false);
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

  // zoom input sync
  useEffect(() => {
    setZoomInput(String(Math.round(getPageDisplaySize(pageNum).scale * 100)));
  }, [pageNum, fitMode, manualScale, viewport, naturalSizes, getPageDisplaySize]);

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
        const next: Record<number, Region[]> = {};
        for (const [page, rs] of Object.entries(prev)) {
          next[Number(page)] = rs
            .map((r) => ({ ...r, sections: r.sections.filter((s) => s.note.id !== noteId) }))
            .filter((r) => r.sections.length > 0);
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
    textLayerRefs,
    loadedStrokePagesRef,
    loadedRegionPagesRef,
    numPages,
    pageNum,
    pageLabels,
    pageInput,
    fitMode,
    fitPopoverOpen,
    manualScale,
    zoomInput,
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
    activeUndo,
    setNumPages,
    setNaturalSizes,
    setPageLabels,
    toc,
    setToc,
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
    setZoomInput,
    getPageNaturalSize,
    getPageDisplaySize,
    updateWindowFromPage,
    loadPageData,
    scrollToPage,
    syncActivePageFromScroll,
    handlePageInputSubmit,
    handleZoomInputSubmit,
    handleInlineStroke,
    undoInline,
    redoInline,
    handleEraseStroke,
    handleSegmentErase,
    handleBatchDeleteInline,
    handleBatchMoveInline,
    handleRegionComplete,
    handleRegionAddToNote,
    handleRegionUpdate,
    handleOpenNote,
    handleRegionLinkNewNote,
    handleRegionLinkExistingNote,
    stopPointerPan,
    handleScrollPointerDown,
    handleScrollPointerMove,
    handleScrollPointerUp,
    handleScrollPointerCancel,
    zoomIn,
    zoomOut,
    fitToContentWidth,
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
