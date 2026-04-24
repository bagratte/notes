import { api } from "./client";
import type {
  Folder, Document, Note, Section, Region, Stroke,
} from "@/types";

// Folders
export const folders = {
  list: (parentFolderId?: number) =>
    api.get<Folder[]>(`/folders/${parentFolderId !== undefined ? `?parent_folder_id=${parentFolderId}` : ""}`),
  get: (id: number) => api.get<Folder>(`/folders/${id}`),
  create: (name: string, parentFolderId?: number) =>
    api.post<Folder>("/folders/", { parent_folder_id: parentFolderId ?? null, name }),
  update: (id: number, name: string) => api.patch<Folder>(`/folders/${id}`, { name }),
  delete: (id: number) => api.delete(`/folders/${id}`),
};

// Documents
export const documents = {
  list: (params: { folderId?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.folderId !== undefined) q.set("folder_id", String(params.folderId));
    return api.get<Document[]>(`/documents/${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => api.get<Document>(`/documents/${id}`),
  upload: (name: string, file: File, folderId?: number) => {
    const form = new FormData();
    if (folderId !== undefined) form.append("folder_id", String(folderId));
    form.append("name", name);
    form.append("file", file);
    return api.postForm<Document>("/documents/", form);
  },
  fileUrl: (id: number) => `/api/documents/${id}/file`,
  update: (id: number, name: string) => api.patch<Document>(`/documents/${id}`, { name }),
  delete: (id: number) => api.delete(`/documents/${id}`),
};

// Notes
export const notes = {
  list: (params: { folderId?: number; documentId?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.folderId !== undefined) q.set("folder_id", String(params.folderId));
    if (params.documentId !== undefined) q.set("document_id", String(params.documentId));
    return api.get<Note[]>(`/notes/${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => api.get<Note>(`/notes/${id}`),
  create: (name: string, folderId?: number) =>
    api.post<Note>("/notes/", { folder_id: folderId ?? null, name }),
  update: (id: number, name: string) => api.patch<Note>(`/notes/${id}`, { name }),
  delete: (id: number) => api.delete(`/notes/${id}`),
  merge: (sourceId: number, targetId: number) =>
    api.post<void>(`/notes/${sourceId}/merge`, { target_note_id: targetId }),
};

// Sections
export const sections = {
  list: (noteId: number) => api.get<Section[]>(`/sections/?note_id=${noteId}`),
  get: (id: number) => api.get<Section>(`/sections/${id}`),
  create: (noteId: number, order: number) =>
    api.post<Section>("/sections/", { note_id: noteId, order }),
  reorder: (sectionIds: number[]) =>
    api.post<void>("/sections/reorder", { section_ids: sectionIds }),
  delete: (id: number) => api.delete(`/sections/${id}`),
};

// Regions
export const regions = {
  list: (params: { documentId?: number; sectionId?: number; pageNumber?: number }) => {
    const q = new URLSearchParams();
    if (params.documentId !== undefined) q.set("document_id", String(params.documentId));
    if (params.sectionId !== undefined) q.set("section_id", String(params.sectionId));
    if (params.pageNumber !== undefined) q.set("page_number", String(params.pageNumber));
    return api.get<Region[]>(`/regions/?${q}`);
  },
  create: (data: {
    documentId: number; sectionId: number; pageNumber: number;
    x: number; y: number; width: number; height: number;
  }) =>
    api.post<Region>("/regions/", {
      document_id: data.documentId,
      section_id: data.sectionId,
      page_number: data.pageNumber,
      x: data.x, y: data.y, width: data.width, height: data.height,
    }),
  delete: (id: number) => api.delete(`/regions/${id}`),
};

// Strokes
export const strokes = {
  listForSection: (sectionId: number) =>
    api.get<Stroke[]>(`/strokes/?section_id=${sectionId}`),
  listForPage: (documentId: number, pageNumber: number) =>
    api.get<Stroke[]>(`/strokes/?document_id=${documentId}&page_number=${pageNumber}`),
  create: (stroke: Omit<Stroke, "id" | "created_at">) =>
    api.post<Stroke>("/strokes/", stroke),
  createBatch: (strokeList: Omit<Stroke, "id" | "created_at">[]) =>
    api.post<Stroke[]>("/strokes/batch", { strokes: strokeList }),
  delete: (id: number) => api.delete(`/strokes/${id}`),
  deleteForSection: (sectionId: number) =>
    api.delete(`/strokes/?section_id=${sectionId}`),
  deleteForPage: (documentId: number, pageNumber: number) =>
    api.delete(`/strokes/?document_id=${documentId}&page_number=${pageNumber}`),
};
