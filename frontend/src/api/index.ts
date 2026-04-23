import { api } from "./client";
import type {
  Notebook, Folder, Document, Note, Section, Region, Stroke,
} from "@/types";

// Notebooks
export const notebooks = {
  list: () => api.get<Notebook[]>("/notebooks/"),
  get: (id: number) => api.get<Notebook>(`/notebooks/${id}`),
  create: (name: string) => api.post<Notebook>("/notebooks/", { name }),
  update: (id: number, name: string) => api.patch<Notebook>(`/notebooks/${id}`, { name }),
  delete: (id: number) => api.delete(`/notebooks/${id}`),
};

// Folders
export const folders = {
  list: (notebookId?: number) =>
    api.get<Folder[]>(`/folders/${notebookId !== undefined ? `?notebook_id=${notebookId}` : ""}`),
  get: (id: number) => api.get<Folder>(`/folders/${id}`),
  create: (notebookId: number, name: string) =>
    api.post<Folder>("/folders/", { notebook_id: notebookId, name }),
  update: (id: number, name: string) => api.patch<Folder>(`/folders/${id}`, { name }),
  delete: (id: number) => api.delete(`/folders/${id}`),
};

// Documents
export const documents = {
  list: (folderId?: number) =>
    api.get<Document[]>(`/documents/${folderId !== undefined ? `?folder_id=${folderId}` : ""}`),
  get: (id: number) => api.get<Document>(`/documents/${id}`),
  upload: (folderId: number, name: string, file: File) => {
    const form = new FormData();
    form.append("folder_id", String(folderId));
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
  list: (folderId?: number) =>
    api.get<Note[]>(`/notes/${folderId !== undefined ? `?folder_id=${folderId}` : ""}`),
  get: (id: number) => api.get<Note>(`/notes/${id}`),
  create: (folderId: number, name: string) =>
    api.post<Note>("/notes/", { folder_id: folderId, name }),
  update: (id: number, name: string) => api.patch<Note>(`/notes/${id}`, { name }),
  delete: (id: number) => api.delete(`/notes/${id}`),
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
