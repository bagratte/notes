import { useEffect, useRef, useCallback } from "react";
import { pdfjsLib } from "./pdfSetup";
import ViewerShell from "./ViewerShell";
import { useDocumentViewer } from "./useDocumentViewer";
import type { ViewerProps } from "./viewerTypes";
import { WINDOW_BUFFER } from "./viewerTypes";

export default function PdfViewer({ url, documentId, folderId, initialPage, overlayEnabled = true, serverLastPage, serverLastPageUpdatedAt }: ViewerProps) {
  const hook = useDocumentViewer({ documentId, folderId, initialPage, serverLastPage, serverLastPageUpdatedAt });

  // PDF-specific refs
  const pdfDocRef = useRef<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null>(null);
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());
  const renderVersionRef = useRef<Map<number, number>>(new Map());
  const loadingPagesRef = useRef<Set<number>>(new Set());

  // Load individual page natural sizes (PDF sizes are lazy, unlike DjVu which provides all upfront)
  const loadPdfPageNaturalSize = useCallback(async (page: number) => {
    const doc = pdfDocRef.current;
    if (!doc || hook.naturalSizes[page] || loadingPagesRef.current.has(page)) return;
    loadingPagesRef.current.add(page);
    try {
      const pdfPage = await doc.getPage(page);
      const vp = pdfPage.getViewport({ scale: 1 });
      hook.setNaturalSizes((prev) => {
        if (prev[page]) return prev;
        return { ...prev, [page]: { width: vp.width, height: vp.height } };
      });
    } finally {
      loadingPagesRef.current.delete(page);
    }
  }, [hook.naturalSizes, hook.setNaturalSizes]);

  // Load document
  useEffect(() => {
    let destroyed = false;
    hook.resetForLoad(initialPage ?? 1);
    loadingPagesRef.current.clear();

    const task = pdfjsLib.getDocument(url);
    task.promise
      .then(async (doc) => {
        if (destroyed) { doc.destroy(); return; }
        pdfDocRef.current = doc;

        // Pre-load natural sizes for initial window before revealing the document.
        // This mirrors DjVu's upfront behaviour and prevents layout shifts.
        const targetPage = Math.max(1, Math.min(doc.numPages, initialPage ?? 1));
        const preloadStart = Math.max(1, targetPage - WINDOW_BUFFER);
        const preloadEnd = Math.min(doc.numPages, targetPage + WINDOW_BUFFER);
        const initialSizes: Record<number, { width: number; height: number }> = {};
        await Promise.all(
          Array.from({ length: preloadEnd - preloadStart + 1 }, (_, i) => preloadStart + i).map(
            async (p) => {
              try {
                const pdfPage = await doc.getPage(p);
                const vp = pdfPage.getViewport({ scale: 1 });
                initialSizes[p] = { width: vp.width, height: vp.height };
              } catch {
                // ignore — page falls back to placeholder dimensions
              }
            }
          )
        );

        if (destroyed) return;
        hook.setNaturalSizes(initialSizes);
        hook.setNumPages(doc.numPages);
        hook.setLoading(false);
        const labels = await doc.getPageLabels().catch(() => null);
        if (!destroyed) hook.setPageLabels(labels);
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        if (err instanceof Error && err.name === "AbortException") return;
        hook.setError(String(err));
        hook.setLoading(false);
      });

    return () => {
      destroyed = true;
      task.destroy();
      renderTasksRef.current.forEach((t) => t.cancel());
      renderTasksRef.current.clear();
      renderVersionRef.current.clear();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, initialPage]);

  // Load page sizes + data for buffered window
  useEffect(() => {
    if (hook.numPages === 0) return;
    const pages: number[] = [];
    for (let p = hook.windowRange.start; p <= hook.windowRange.end; p += 1) pages.push(p);
    pages.forEach((page) => {
      void loadPdfPageNaturalSize(page);
      void hook.loadPageData(page);
    });
  }, [hook.numPages, hook.windowRange, loadPdfPageNaturalSize, hook.loadPageData]);

  // Render buffered pages to canvas
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || hook.numPages === 0) return;

    for (let page = hook.windowRange.start; page <= hook.windowRange.end; page += 1) {
      const canvas = hook.canvasRefs.current.get(page);
      const natural = hook.naturalSizes[page];
      if (!canvas || !natural) continue;

      const { scale } = hook.getPageDisplaySize(page);
      const width = Math.round(natural.width * scale);
      const height = Math.round(natural.height * scale);
      if (canvas.width === width && canvas.height === height) continue;

      const version = (renderVersionRef.current.get(page) ?? 0) + 1;
      renderVersionRef.current.set(page, version);

      const previousTask = renderTasksRef.current.get(page);
      if (previousTask) { previousTask.cancel(); renderTasksRef.current.delete(page); }

      doc.getPage(page).then((pdfPage) => {
        if (renderVersionRef.current.get(page) !== version) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        const viewportForRender = pdfPage.getViewport({ scale });
        const renderTask = pdfPage.render({ canvasContext: ctx, viewport: viewportForRender });
        renderTasksRef.current.set(page, renderTask);
        renderTask.promise
          .catch((err: unknown) => {
            if (err instanceof Error && err.name !== "RenderingCancelledException") {
              console.error("PDF render error:", err);
            }
          })
          .finally(() => {
            if (renderTasksRef.current.get(page) === renderTask) renderTasksRef.current.delete(page);
          });
      }).catch((err: unknown) => {
        console.error("Failed to render PDF page", page, err);
      });
    }
  }, [hook.numPages, hook.windowRange, hook.naturalSizes, hook.getPageDisplaySize]);

  // Sync data when strokes change from another view
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId: number; pageNumber: number }>).detail;
      if (detail.documentId !== documentId) return;
      void hook.loadPageData(detail.pageNumber, true);
    };
    window.addEventListener("document:page-strokes-changed", handler);
    return () => window.removeEventListener("document:page-strokes-changed", handler);
  }, [documentId, hook.loadPageData]);

  return <ViewerShell {...hook} overlayEnabled={overlayEnabled} errorLabel="PDF" />;
}
