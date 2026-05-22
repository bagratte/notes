import * as pdfjsLib from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";

// Vite resolves this to the correct asset URL at build time
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

export { pdfjsLib, TextLayer };
