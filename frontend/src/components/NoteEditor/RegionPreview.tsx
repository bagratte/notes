import { useEffect, useRef, useState } from "react";
import { regions as regionsApi, documents as docsApi } from "@/api";
import { renderRegionCrop } from "@/components/DocumentViewer/regionCrop";
import type { Region, Document } from "@/types";

const PREVIEW_W = 700;

interface Props {
  sectionId: number;
  onRegionLoaded?: (dims: { width: number; height: number } | null, region?: Region, doc?: Document) => void;
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

      const doc: Document = await docsApi.get(region.document_id);
      if (cancelled) return;
      onRegionLoaded?.({ width: region.width, height: region.height }, region, doc);

      const dpr = window.devicePixelRatio || 1;
      const rendered = await renderRegionCrop(region, doc, PREVIEW_W * dpr);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext("2d")!.drawImage(rendered, 0, 0);
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
