import { useEffect, useState } from "react";
import { notes as notesApi, folders as foldersApi } from "@/api";
import type { Note, Folder } from "@/types";
import css from "./RegionLinkModal.module.css";

interface Props {
  onLink: (noteId: number) => void;
  onCancel: () => void;
}

export default function RegionLinkModal({ onLink, onCancel }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [search, setSearch] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("Untitled Note");
  const [newFolderId, setNewFolderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([notesApi.list(), foldersApi.list()]).then(([n, f]) => {
      setNotes(n);
      setFolders(f);
      if (f.length > 0) setNewFolderId(f[0].id);
    });
  }, []);

  const folderName = (folderId: number) =>
    folders.find((f) => f.id === folderId)?.name ?? "—";

  const filtered = notes.filter((n) =>
    n.name.toLowerCase().includes(search.toLowerCase())
  );

  const canConfirm = creating
    ? newName.trim().length > 0 && newFolderId !== null
    : selectedNoteId !== null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (creating && newFolderId !== null) {
        const note = await notesApi.create(newFolderId, newName.trim());
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
                        {folderName(note.folder_id)}
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
