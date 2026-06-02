import { useEffect, useRef, useState } from "react";
import { regions as regionsApi, documents as docsApi } from "@/api";
import { pdfjsLib } from "@/components/DocumentViewer/pdfSetup";
import type { Region, Document } from "@/types";

const PREVIEW_W = 700;

interface Props {
  sectionId: number;
  onRegionLoaded?: (dims: { width: number; height: number } | null) => void;
}

export default function RegionPreview({ sectionId, onRegionLoaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [noRegion, setNoRegion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await regionsApi.list({ sectionId });
      if (cancelled) return;
      if (results.length === 0) {
        setNoRegion(true);
        onRegionLoaded?.(null);
        return;
      }
      const region: Region = results[0];
      onRegionLoaded?.({ width: region.width, height: region.height });

      const doc: Document = await docsApi.get(region.document_id);
      if (cancelled) return;

      const url = docsApi.fileUrl(region.document_id);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const bufW = Math.round(PREVIEW_W * dpr);
      const h = Math.round(bufW * region.height / region.width);
      canvas.width = bufW;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      const off = document.createElement("canvas");
      let srcX = region.x, srcY = region.y, srcW = region.width, srcH = region.height;

      if (doc.type === "pdf") {
        const pdfDoc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const page = await pdfDoc.getPage(region.page_number);
        if (cancelled) return;
        const renderScale = Math.min(3, bufW / region.width);
        const vp = page.getViewport({ scale: renderScale });
        off.width = Math.round(vp.width);
        off.height = Math.round(vp.height);
        await page.render({ canvasContext: off.getContext("2d")!, viewport: vp }).promise;
        srcX = region.x * renderScale;
        srcY = region.y * renderScale;
        srcW = region.width * renderScale;
        srcH = region.height * renderScale;
      } else {
        const buffer = await fetch(url).then((r) => r.arrayBuffer());
        if (cancelled) return;
        const djvuDoc = new DjVu.Document(buffer);
        const page = await djvuDoc.getPage(region.page_number);
        if (cancelled) return;
        const img = page.getImageData();
        off.width = img.width;
        off.height = img.height;
        off.getContext("2d")!.putImageData(img, 0, 0);
        page.reset();

        // region coords are in natural units (PDF points: native_px / dpi * 72).
        // Scale to native DjVu pixel coordinates for cropping.
        const sizes = djvuDoc.getPagesSizes();
        const ps = sizes[region.page_number - 1];
        if (ps) {
          const naturalW = (ps.width / ps.dpi) * 72;
          const naturalH = (ps.height / ps.dpi) * 72;
          srcX = (region.x / naturalW) * off.width;
          srcY = (region.y / naturalH) * off.height;
          srcW = (region.width / naturalW) * off.width;
          srcH = (region.height / naturalH) * off.height;
        }
      }

      if (cancelled) return;
      ctx.drawImage(off, srcX, srcY, srcW, srcH, 0, 0, bufW, h);
      setReady(true);
    }

    load().catch(() => { if (!cancelled) { setNoRegion(true); onRegionLoaded?.(null); } });
    return () => { cancelled = true; };
  }, [sectionId]);

  if (noRegion) return null;

  return (
    <div style={{ borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
      {!ready && <div style={{ height: 60, background: "#f0ede8" }} />}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", display: ready ? "block" : "none" }}
      />
    </div>
  );
}
