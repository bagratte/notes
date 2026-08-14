import { getStroke } from "perfect-freehand";
import type { StrokeData } from "./types";

// Converts perfect-freehand's outline polygon to an SVG path string.
// Uses quadratic bezier curves through midpoints for smooth rendering.
export function svgPathFromStroke(points: number[][]): string {
  if (!points.length) return "";

  const d = points.reduce<string[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(
        x0.toFixed(2),
        y0.toFixed(2),
        ((x0 + x1) / 2).toFixed(2),
        ((y0 + y1) / 2).toFixed(2)
      );
      return acc;
    },
    ["M", points[0][0].toFixed(2), points[0][1].toFixed(2), "Q"]
  );

  return d.join(" ");
}

// Flips the HSL lightness of a hex color (L → 100 - L), preserving hue and saturation.
// Used for dark mode stroke rendering so stored colors remain unchanged.
export function flipLightness(hex: string): string {
  let src = hex;
  let alpha = "";
  const m8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(hex);
  if (m8) { src = "#" + m8[1]; alpha = m8[2]; }

  const m = /^#([0-9a-f]{6})$/i.exec(src);
  if (!m) return hex;

  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }

  const l2 = 1 - l;
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
  const p = 2 * l2 - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(hue2rgb(h + 1 / 3))}${toHex(hue2rgb(h))}${toHex(hue2rgb(h - 1 / 3))}${alpha}`;
}

const STROKE_RENDER_OPTS = { thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true };

// Renders strokes (in their own coordinate space) to an SVG string sized to `opts.width`/`opts.height`
// pixels. `opts.viewBox` lets the caller map a different natural coordinate frame onto that pixel size
// (e.g. a region's natural width/height) — defaults to "0 0 width height" (no remapping).
export function strokesToSvgString(
  strokes: StrokeData[],
  opts: { width: number; height: number; viewBox?: string; transparentBg?: boolean }
): string {
  const { width, height, viewBox = `0 0 ${width} ${height}`, transparentBg } = opts;
  const paths = strokes.map((s) => {
    const isHighlighter = s.color.length === 9;
    const outline = getStroke(s.points, {
      ...STROKE_RENDER_OPTS,
      thinning: isHighlighter ? 0 : STROKE_RENDER_OPTS.thinning,
      simulatePressure: isHighlighter ? false : STROKE_RENDER_OPTS.simulatePressure,
      size: s.width,
    });
    return `<path d="${svgPathFromStroke(outline)}" fill="${s.color}" />`;
  });
  const bg = transparentBg ? "" : `<rect x="0" y="0" width="100%" height="100%" fill="#fff" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${bg}${paths.join("")}</svg>`;
}

// Rasterizes an SVG string onto a canvas of the given pixel size.
export function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Renders strokes cropped to their own bounding box (plus padding) on a white background, at 2x
// scale so the result stays legible when pasted into another app. Throws if given no strokes.
export async function renderStrokesCrop(strokes: StrokeData[]): Promise<HTMLCanvasElement> {
  if (strokes.length === 0) throw new Error("no strokes to render");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const [px, py] of s.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  const padding = 12;
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const w = maxX - minX, h = maxY - minY;
  const shifted = strokes.map((s) => ({
    ...s,
    points: s.points.map(([x, y, p]) => [x - minX, y - minY, p] as [number, number, number]),
  }));
  const scale = 2;
  const svg = strokesToSvgString(shifted, { width: w * scale, height: h * scale, viewBox: `0 0 ${w} ${h}` });
  return rasterizeSvg(svg, w * scale, h * scale);
}

// Marker attribute stamped onto the `text/html` flavour of our own clipboard writes. It carries the
// id of the matching in-app clipboard entry, so a future OS-clipboard paste handler can tell "this
// is the copy I just made, paste it as vector strokes" from "this came from another app, paste it
// as an image". Only copies that also populate the in-app stroke clipboard should carry it.
export const CLIPBOARD_COPY_ID_ATTR = "data-notes-copy";

// Writes an image to the system clipboard as a PNG. `render` is invoked immediately but may resolve
// later: `clipboard.write()` is reached synchronously, which is what Safari requires — user
// activation is still live at that point, and the async work happens inside the ClipboardItem.
// Rejects when the clipboard API is unavailable (it is gated on a secure context, so plain-HTTP
// origins have no `navigator.clipboard`); callers that have another job to do should catch.
export function copyImageToClipboard(
  render: () => Promise<HTMLCanvasElement>,
  opts: { copyId?: string } = {}
): Promise<void> {
  if (!navigator.clipboard?.write) return Promise.reject(new Error("clipboard unavailable"));
  const png = render().then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      })
  );
  const items: Record<string, Promise<Blob>> = { "image/png": png };
  if (opts.copyId) {
    items["text/html"] = Promise.resolve(
      new Blob([`<span ${CLIPBOARD_COPY_ID_ATTR}="${opts.copyId}"></span>`], { type: "text/html" })
    );
  }
  return navigator.clipboard.write([new ClipboardItem(items)]);
}

// Ids for `CLIPBOARD_COPY_ID_ATTR`. Deliberately not `crypto.randomUUID()` — that is only exposed in
// secure contexts, and this runs on plain-HTTP LAN origins too.
export function newCopyId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
