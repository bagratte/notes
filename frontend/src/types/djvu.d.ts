// Global type declarations for the DjVu.js IIFE bundle (loaded via <script> in index.html).
// API reference: https://github.com/RussCoder/djvujs/blob/master/library/API.md

interface DjVuPage {
  getWidth(): number;
  getHeight(): number;
  getDpi(): number;
  getRotation(): 0 | 90 | 180 | 270;
  getImageData(rotate?: boolean): ImageData;
  reset(): void;
  getNormalizedTextZones(): Array<{ x: number; y: number; width: number; height: number; text: string }>;
}

interface DjVuContentsEntry {
  url: string;
  description: string;
  children?: DjVuContentsEntry[];
}

interface DjVuDocument {
  getPagesQuantity(): number;
  getPagesSizes(): Array<{ width: number; height: number; dpi: number }>;
  getPage(number: number): Promise<DjVuPage>;
  getPageUnsafe(number: number): DjVuPage;
  getContents(): DjVuContentsEntry[] | null;
}

declare const DjVu: {
  Document: new (buffer: ArrayBuffer) => DjVuDocument;
};
