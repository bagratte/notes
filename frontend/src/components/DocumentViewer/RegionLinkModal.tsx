import { useEffect, useState } from "react";
import { notes as notesApi, folders as foldersApi, notebooks as nbApi } from "@/api";
import type { Note, Folder, Notebook } from "@/types";
import css from "./RegionLinkModal.module.css";

interface Props {
  onLink: (noteId: number) => void;
  onCancel: () => void;
}

export default function RegionLinkModal({ onLink, onCancel }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [search, setSearch] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("Untitled Note");
  const [newParentType, setNewParentType] = useState<"folder" | "notebook">("folder");
  const [newFolderId, setNewFolderId] = useState<number | null>(null);
  const [newNotebookId, setNewNotebookId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([notesApi.list(), foldersApi.list(), nbApi.list()]).then(([n, f, nbs]) => {
      setNotes(n);
      setFolders(f);
      setNotebooks(nbs);
      if (f.length > 0) setNewFolderId(f[0].id);
      if (nbs.length > 0) setNewNotebookId(nbs[0].id);
    });
  }, []);

  const locationLabel = (note: Note): string => {
    if (note.folder_id !== null) return folders.find((f) => f.id === note.folder_id)?.name ?? "—";
    if (note.notebook_id !== null) return notebooks.find((nb) => nb.id === note.notebook_id)?.name ?? "—";
    return "—";
  };

  const filtered = notes.filter((n) =>
    n.name.toLowerCase().includes(search.toLowerCase())
  );

  const canConfirm = creating
    ? newName.trim().length > 0 &&
      (newParentType === "folder" ? newFolderId !== null : newNotebookId !== null)
    : selectedNoteId !== null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (creating) {
        const parent = newParentType === "folder" && newFolderId !== null
          ? { folderId: newFolderId }
          : { notebookId: newNotebookId! };
        const note = await notesApi.create(parent, newName.trim());
        onLink(note.id);
      } else if (selectedNoteId !== null) {
        onLink(selectedNoteId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.backdrop} onClick={onCancel}>
      <div className={css.modal} onClick={(e) => e.stopPropagation()}>
        <div className={css.header}>Link region to note</div>

        <div className={css.body}>
          {!creating && (
            <>
              <input
                className={css.searchInput}
                placeholder="Search notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />

              {notes.length === 0 ? (
                <div className={css.emptyNotes}>No notes yet.</div>
              ) : filtered.length === 0 ? (
                <div className={css.emptyNotes}>No matches.</div>
              ) : (
                <div className={css.noteList}>
                  {filtered.map((note) => (
                    <div
                      key={note.id}
                      className={`${css.noteItem}${selectedNoteId === note.id ? " " + css.selected : ""}`}
                      onClick={() => setSelectedNoteId(note.id)}
                    >
                      <span>{note.name}</span>
                      <span className={css.noteItemSub}>
                        {locationLabel(note)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <hr className={css.divider} />

              <button
                className={css.cancelBtn}
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => { setCreating(true); setSelectedNoteId(null); }}
              >
                + Create new note
              </button>
            </>
          )}

          {creating && (
            <>
              <div className={css.sectionLabel}>New note</div>
              <div className={css.newNoteForm}>
                <input
                  className={css.input}
                  placeholder="Note name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <select
                  className={css.select}
                  value={newParentType}
                  onChange={(e) => setNewParentType(e.target.value as "folder" | "notebook")}
                >
                  <option value="folder">In folder</option>
                  <option value="notebook">In notebook (no folder)</option>
                </select>
                {newParentType === "folder" ? (
                  <select
                    className={css.select}
                    value={newFolderId ?? ""}
                    onChange={(e) => setNewFolderId(Number(e.target.value))}
                  >
                    {folders.length === 0 && (
                      <option value="" disabled>No folders available</option>
                    )}
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    className={css.select}
                    value={newNotebookId ?? ""}
                    onChange={(e) => setNewNotebookId(Number(e.target.value))}
                  >
                    {notebooks.length === 0 && (
                      <option value="" disabled>No notebooks available</option>
                    )}
                    {notebooks.map((nb) => (
                      <option key={nb.id} value={nb.id}>{nb.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <hr className={css.divider} />

              <button
                className={css.cancelBtn}
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => setCreating(false)}
              >
                ← Back to existing notes
              </button>
            </>
          )}
        </div>

        <div className={css.footer}>
          <button className={css.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            className={css.linkBtn}
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
          >
            {busy ? "Linking…" : "Link region"}
          </button>
        </div>
      </div>
    </div>
  );
}
