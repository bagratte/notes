import { useEffect, useRef, useCallback } from "react";
import ViewerShell from "./ViewerShell";
import { useDocumentViewer } from "./useDocumentViewer";
import type { ViewerProps, NaturalSize } from "./viewerTypes";

export default function DjvuViewer({ url, documentId, folderId, initialPage, overlayEnabled = true, serverLastPage, serverLastPageUpdatedAt }: ViewerProps) {
  const hook = useDocumentViewer({ documentId, folderId, initialPage, serverLastPage, serverLastPageUpdatedAt });

  // DjVu-specific refs
  const docRef = useRef<DjVuDocument | null>(null);
  const loadingRastersRef = useRef<Set<number>>(new Set());
  const renderGenRef = useRef<Map<number, number>>(new Map());
  // Always-current ref so in-flight renders pick up the latest zoom scale
  const getPageDisplaySizeRef = useRef(hook.getPageDisplaySize);
  useEffect(() => { getPageDisplaySizeRef.current = hook.getPageDisplaySize; });

  const renderDjvuPage = useCallback(async (page: number) => {
    const doc = docRef.current;
    const natural = hook.naturalSizes[page];
    if (!doc || !natural) return;

    // Bump render generation so in-flight renders re-draw at the latest zoom scale
    const version = (renderGenRef.current.get(page) ?? 0) + 1;
    renderGenRef.current.set(page, version);

    // If already decoding, the current render will pick up the new scale in its draw loop
    if (loadingRastersRef.current.has(page)) return;

    loadingRastersRef.current.add(page);
    try {
      const djvuPage = await doc.getPage(page);
      const imageData = djvuPage.getImageData();

      // Draw loop: re-draw if zoom changed while decoding or drawing
      let drawVersion: number;
      do {
        drawVersion = renderGenRef.current.get(page)!;

        const canvas = hook.canvasRefs.current.get(page);
        if (!canvas) break;

        const { width, height } = getPageDisplaySizeRef.current(page);
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);

        const ctx = canvas.getContext("2d");
        if (!ctx) break;

        const offscreen = document.createElement("canvas");
        offscreen.width = imageData.width;
        offscreen.height = imageData.height;
        const offscreenCtx = offscreen.getContext("2d");
        if (!offscreenCtx) break;
        offscreenCtx.putImageData(imageData, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
      } while (renderGenRef.current.get(page) !== drawVersion);
    } finally {
      loadingRastersRef.current.delete(page);
    }
  }, [hook.naturalSizes, hook.canvasRefs]);

  // Load document
  useEffect(() => {
    let cancelled = false;
    hook.resetForLoad(initialPage ?? 1);
    loadingRastersRef.current.clear();
    renderGenRef.current.clear();

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

        // Normalize DjVu native scan pixels to PDF points (1 pt = 1/72 inch, ISO 32000)
        // so that natural sizes are in the same unit system as PDF.js getViewport({scale:1}).
        const PDF_POINTS_PER_INCH = 72;
        const byPage: Record<number, NaturalSize> = {};
        sizes.forEach((size: { width: number; height: number; dpi: number }, idx: number) => {
          byPage[idx + 1] = {
            width: (size.width / size.dpi) * PDF_POINTS_PER_INCH,
            height: (size.height / size.dpi) * PDF_POINTS_PER_INCH,
          };
        });

        hook.setNaturalSizes(byPage);
        hook.setNumPages(count);
        hook.setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          hook.setError(String(err));
          hook.setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, initialPage]);

  // Load data + render pages for buffered window
  useEffect(() => {
    if (hook.numPages === 0) return;
    const pages: number[] = [];
    for (let p = hook.windowRange.start; p <= hook.windowRange.end; p += 1) pages.push(p);
    pages.forEach((page) => {
      void hook.loadPageData(page);
      void renderDjvuPage(page);
    });
  }, [hook.numPages, hook.windowRange, hook.loadPageData, renderDjvuPage, hook.fitMode, hook.manualScale, hook.viewport]);

  // Sync data + re-render when strokes change from another view
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      if (detail.documentId !== documentId) return;
      void hook.loadPageData(detail.pageNumber, true);
      void renderDjvuPage(detail.pageNumber);
    };
    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, [documentId, hook.loadPageData, renderDjvuPage]);

  return <ViewerShell {...hook} overlayEnabled={overlayEnabled} errorLabel="DjVu" />;
}
