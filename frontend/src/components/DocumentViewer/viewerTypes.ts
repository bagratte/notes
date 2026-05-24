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

export const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0];
export const WINDOW_BUFFER = 2;
export const PAGE_GUTTER = 16;
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
  const containerWidth = Math.max(400, viewport.width - 48);
  const containerHeight = Math.max(300, viewport.height - 48);
  if (fitMode === "width") return containerWidth / natural.width;
  if (fitMode === "page") return Math.min(containerWidth / natural.width, containerHeight / natural.height);
  return manualScale;
}
