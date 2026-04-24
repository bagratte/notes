import { useEffect, useRef, useState } from "react";
import { regions as regionsApi, documents as docsApi } from "@/api";
import { pdfjsLib } from "@/components/DocumentViewer/pdfSetup";
import type { Region, Document } from "@/types";

const PREVIEW_W = 700;

interface Props {
  sectionId: number;
  onHasRegion?: (has: boolean) => void;
}

export default function RegionPreview({ sectionId, onHasRegion }: Props) {
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
        onHasRegion?.(false);
        return;
      }
      onHasRegion?.(true);

      const region: Region = results[0];
      const doc: Document = await docsApi.get(region.document_id);
      if (cancelled) return;

      const url = docsApi.fileUrl(region.document_id);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const h = Math.round(PREVIEW_W * region.height / region.width);
      canvas.width = PREVIEW_W;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      const off = document.createElement("canvas");

      if (doc.type === "pdf") {
        const pdfDoc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const page = await pdfDoc.getPage(region.page_number);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        off.width = vp.width;
        off.height = vp.height;
        await page.render({ canvasContext: off.getContext("2d")!, viewport: vp }).promise;
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
      }

      if (cancelled) return;
      ctx.drawImage(off, region.x, region.y, region.width, region.height, 0, 0, PREVIEW_W, h);
      setReady(true);
    }

    load().catch(() => { if (!cancelled) { setNoRegion(true); onHasRegion?.(false); } });
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
