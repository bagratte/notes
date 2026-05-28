export type ToolMode = "auto" | "hand" | "pen" | "stroke-eraser" | "segment-eraser" | "select-region" | "text-select" | "stroke-select";

export type DocUndoEntry =
  | { kind: "stroke";       stroke: Stroke }
  | { kind: "batch-delete"; strokes: Stroke[] }
  | { kind: "batch-move";   deleted: Stroke[]; created: Stroke[] };

export type NoteUndoEntry =
  | { sectionId: number; stroke: Stroke }
  | { kind: "batch-delete"; sectionId: number; strokes: Stroke[] }
  | { kind: "batch-move";   sectionId: number; deleted: Stroke[]; created: Stroke[] };

export interface Folder {
  id: number;
  parent_folder_id: number | null;
  name: string;
  created_at: string;
}

export interface Document {
  id: number;
  folder_id: number | null;
  name: string;
  type: "pdf" | "djvu";
  created_at: string;
  last_page: number | null;
  last_page_updated_at: string | null;
}

export interface Note {
  id: number;
  folder_id: number | null;
  name: string;
  created_at: string;
}

export interface Section {
  id: number;
  note_id: number;
  order: number;
  height: number;
  created_at: string;
}

export interface Region {
  id: number;
  document_id: number;
  section_id: number;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface Stroke {
  id: number;
  section_id: number | null;
  document_id: number | null;
  page_number: number | null;
  points: [number, number, number][];  // [x, y, pressure]
  color: string;
  width: number;
  created_at: string;
}
