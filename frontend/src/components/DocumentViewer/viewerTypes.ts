import type { StrokeData } from "@/components/Canvas";
import type { Stroke } from "@/types";

export interface ViewerProps {
  url: string;
  documentId: number;
  folderId?: number;
  initialPage?: number;
  overlayEnabled?: boolean;
  serverLastPage?: number | null;
  serverLastPageUpdatedAt?: string | null;
}

export interface NaturalSize {
  width: number;
  height: number;
}

export interface PendingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  isActive: boolean;
}

export interface TocEntry {
  title: string;
  page: number;
  children: TocEntry[];
}

export const ZOOM_STEPS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
export const WINDOW_BUFFER = 2;
export const PAGE_GUTTER = 8;
export const PAN_DEADZONE_PX = 8;
export const PAGE_FALLBACK_WIDTH = 900;
export const PAGE_FALLBACK_HEIGHT = 1200;

export function toStrokeData(s: Stroke): StrokeData {
  return { id: s.id, points: s.points, color: s.color, width: s.width };
}

export function getDisplayScale(
  fitMode: "width" | "page" | "manual",
  manualScale: number,
  natural: NaturalSize,
  viewport: ViewportSize
): number {
  const containerWidth = Math.max(400, viewport.width - 16);
  const containerHeight = Math.max(300, viewport.height - 16);
  if (fitMode === "width") return containerWidth / natural.width;
  if (fitMode === "page") return Math.min(containerWidth / natural.width, containerHeight / natural.height);
  return manualScale;
}

/**
 * Finds the horizontal extent of non-background content on a rendered page canvas
 * (columns containing pixels that differ from the sampled background color), so
 * zoom can fit to the visible content rather than the full page width.
 */
export function computeContentBounds(canvas: HTMLCanvasElement): { minX: number; maxX: number } | null {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const stride = Math.max(1, Math.floor(Math.max(width, height) / 800));
  const THRESHOLD = 24;
  const sample = (x: number, y: number, i: 0 | 1 | 2) => data[(y * width + x) * 4 + i];
  const bgR = sample(0, 0, 0);
  const bgG = sample(0, 0, 1);
  const bgB = sample(0, 0, 2);
  const differs = (x: number, y: number) =>
    Math.abs(sample(x, y, 0) - bgR) > THRESHOLD ||
    Math.abs(sample(x, y, 1) - bgG) > THRESHOLD ||
    Math.abs(sample(x, y, 2) - bgB) > THRESHOLD;

  let minX = -1;
  let maxX = -1;
  for (let x = 0; x < width; x += stride) {
    let found = false;
    for (let y = 0; y < height; y += stride) {
      if (differs(x, y)) { found = true; break; }
    }
    if (found) {
      if (minX === -1) minX = x;
      maxX = x;
    }
  }
  if (minX === -1) return null;
  return { minX, maxX: Math.min(maxX + stride, width) };
}
