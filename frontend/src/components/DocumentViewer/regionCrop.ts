import { pdfjsLib } from "./pdfSetup";
import { documents as docsApi } from "@/api";
import type { Region, Document } from "@/types";

// Renders the cropped page area covered by `region` onto a canvas, scaled so its width is
// `targetWidth` px. Used both for the small inline region preview (NoteEditor/RegionPreview.tsx)
// and for higher-resolution exports (copy-to-clipboard).
export async function renderRegionCrop(region: Region, doc: Document, targetWidth: number): Promise<HTMLCanvasElement> {
  const url = docsApi.fileUrl(region.document_id);
  const canvas = document.createElement("canvas");
  const bufW = Math.round(targetWidth);
  const h = Math.round(bufW * region.height / region.width);
  canvas.width = bufW;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const off = document.createElement("canvas");
  let srcX = region.x, srcY = region.y, srcW = region.width, srcH = region.height;

  if (doc.type === "pdf") {
    const pdfDoc = await pdfjsLib.getDocument(url).promise;
    const page = await pdfDoc.getPage(region.page_number);
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
    const djvuDoc = new DjVu.Document(buffer);
    const page = await djvuDoc.getPage(region.page_number);
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

  ctx.drawImage(off, srcX, srcY, srcW, srcH, 0, 0, bufW, h);
  return canvas;
}
