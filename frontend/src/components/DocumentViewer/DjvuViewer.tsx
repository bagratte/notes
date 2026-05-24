import { useEffect, useRef, useCallback } from "react";
import ViewerShell from "./ViewerShell";
import { useDocumentViewer } from "./useDocumentViewer";
import type { ViewerProps, NaturalSize, TocEntry } from "./viewerTypes";
import css from "./DocumentViewer.module.css";

function parseDjvuContents(entries: DjVuContentsEntry[]): TocEntry[] {
  const result: TocEntry[] = [];
  for (const entry of entries) {
    const match = String(entry.url ?? "").match(/^#(\d+)$/);
    if (!match) continue;
    const page = parseInt(match[1], 10);
    if (isNaN(page) || page < 1) continue;
    const children = entry.children?.length ? parseDjvuContents(entry.children) : [];
    result.push({ title: String(entry.description ?? ""), page, children });
  }
  return result;
}

export default function DjvuViewer({ url, documentId, folderId, initialPage, overlayEnabled = true, serverLastPage, serverLastPageUpdatedAt }: ViewerProps) {
  const hook = useDocumentViewer({ documentId, folderId, initialPage, serverLastPage, serverLastPageUpdatedAt });

  // DjVu-specific refs
  const docRef = useRef<DjVuDocument | null>(null);
  const loadingRastersRef = useRef<Set<number>>(new Set());
  const renderGenRef = useRef<Map<number, number>>(new Map());
  // Caches decoded pixel data and GPU-backed bitmaps per page to avoid re-decoding on zoom/navigation.
  // The DjVu.js library calls reset() on the previously-accessed page whenever getPage() is called
  // for a different page, so without these caches every zoom triggers a full re-decode of all
  // buffered pages.
  const imageDataCacheRef = useRef<Map<number, ImageData>>(new Map());
  const imageBitmapCacheRef = useRef<Map<number, ImageBitmap>>(new Map());
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

    // Fast path: bitmap already cached — just redraw at the new zoom scale (synchronous, instant)
    let bitmap = imageBitmapCacheRef.current.get(page);
    if (!bitmap) {
      loadingRastersRef.current.add(page);
      try {
        let imageData = imageDataCacheRef.current.get(page);
        if (!imageData) {
          const djvuPage = await doc.getPage(page);
          imageData = djvuPage.getImageData();
          imageDataCacheRef.current.set(page, imageData);
        }
        bitmap = await createImageBitmap(imageData);
        imageBitmapCacheRef.current.set(page, bitmap);
      } catch {
        return;
      } finally {
        loadingRastersRef.current.delete(page);
      }
    }

    // Draw loop: re-draw if zoom changed while decoding
    let drawVersion: number;
    do {
      drawVersion = renderGenRef.current.get(page)!;

      const canvas = hook.canvasRefs.current.get(page);
      if (!canvas) break;

      const { width, height } = getPageDisplaySizeRef.current(page);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) break;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } while (renderGenRef.current.get(page) !== drawVersion);
  }, [hook.naturalSizes, hook.canvasRefs]);

  // Load document
  useEffect(() => {
    let cancelled = false;
    hook.resetForLoad(initialPage ?? 1);
    loadingRastersRef.current.clear();
    renderGenRef.current.clear();
    imageDataCacheRef.current.clear();
    imageBitmapCacheRef.current.forEach((bm) => bm.close());
    imageBitmapCacheRef.current.clear();

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

        try {
          const contents = doc.getContents();
          if (contents?.length) {
            const toc = parseDjvuContents(contents);
            if (!cancelled && toc.length) {
              hook.setToc(toc);
              window.dispatchEvent(new CustomEvent("document:toc-loaded", { detail: { documentId, toc } }));
            }
          }
        } catch {
          // getContents unavailable or failed — no TOC
        }
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
      imageDataCacheRef.current.clear();
      imageBitmapCacheRef.current.forEach((bm) => bm.close());
      imageBitmapCacheRef.current.clear();
      hook.textLayerRefs.current.forEach((div) => {
        div.innerHTML = "";
        delete div.dataset.djvuTextRendered;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, initialPage]);

  // Evict decoded image data for pages that have scrolled outside the buffer window
  useEffect(() => {
    const { start, end } = hook.windowRange;
    for (const [page, bm] of imageBitmapCacheRef.current) {
      if (page < start || page > end) {
        bm.close();
        imageBitmapCacheRef.current.delete(page);
        imageDataCacheRef.current.delete(page);
      }
    }
  }, [hook.windowRange]);

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

  // Render text layer for each buffered page when in text-select mode
  useEffect(() => {
    if (hook.toolMode !== "text-select") return;
    const doc = docRef.current;
    if (!doc || hook.numPages === 0) return;

    for (let page = hook.windowRange.start; page <= hook.windowRange.end; page += 1) {
      const div = hook.textLayerRefs.current.get(page);
      if (!div || div.dataset.djvuTextRendered) continue;

      const capturedPage = page;
      doc.getPage(capturedPage).then((djvuPage) => {
        const currentDiv = hook.textLayerRefs.current.get(capturedPage);
        if (!currentDiv || currentDiv.dataset.djvuTextRendered) return;

        const pageW = djvuPage.getWidth();
        const pageH = djvuPage.getHeight();
        const zones = djvuPage.getNormalizedTextZones();

        // Each zone is a paragraph (or whatever the OCR leaf level is) — we render it
        // as a single <div> with text-align:justify so the browser wraps the text into
        // lines that approximately follow the underlying image's line layout.
        // Coordinates: zone.x/y in raw DjVu pixels with y=0 at bottom-left; CSS
        // `bottom` maps directly. Container is at display size (100% of pageWrap), so
        // percentage positions resolve to display pixels. Font-size uses --scale-factor
        // so it tracks zoom without re-rendering.
        const fragment = document.createDocumentFragment();
        for (const zone of zones) {
          const div = document.createElement("div");
          div.className = css.djvuZone;
          div.textContent = zone.text;
          // Estimate font-size to fit text within the zone bounds, assuming avg char
          // width ≈ 0.55 * fontSize and line-height ≈ 1.2.
          const textLen = Math.max(zone.text.length, 1);
          const estFontSize = Math.sqrt((zone.width * zone.height) / (textLen * 0.66));
          const fontSize = Math.min(estFontSize, zone.height);
          div.style.left = `${(zone.x / pageW) * 100}%`;
          div.style.bottom = `${(zone.y / pageH) * 100}%`;
          div.style.width = `${(zone.width / pageW) * 100}%`;
          div.style.height = `${(zone.height / pageH) * 100}%`;
          div.style.fontSize = `calc(var(--scale-factor) * ${fontSize}px)`;
          fragment.appendChild(div);
        }
        currentDiv.appendChild(fragment);
        currentDiv.dataset.djvuTextRendered = "1";
      }).catch(() => {
        // page unavailable — ignore
      });
    }
  }, [hook.toolMode, hook.windowRange, hook.numPages, hook.textLayerRefs]);

  return <ViewerShell {...hook} overlayEnabled={overlayEnabled} errorLabel="DjVu" />;
}
