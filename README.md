# Notes

A handwriting note-taking and document annotation app. Write freehand notes, annotate PDFs and DjVu files, and link regions of a document page to sections of a note — all with a stylus or mouse.

## Features

- **Freehand notes** — sections of free-form strokes, no typed text
- **Document viewer** — PDF and DjVu support
- **Inline annotations** — draw directly on document pages
- **Region linking** — drag a bounding box on a page, link it to a note section; click the box to jump to the linked note
- **Side-by-side view** — document on the left, linked note on the right; clicking a region scrolls the note pane to the linked section
- **Pen settings** — color and width picker per drawing surface
- **Undo / redo** — per canvas, via toolbar buttons or keyboard shortcuts
- **Organization** — Folders (arbitrarily nested) containing Notes and Documents

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Routing | React Router v6 |
| Drawing | perfect-freehand, SVG |
| PDF | PDF.js |
| DjVu | DjVu.js (IIFE global) |
| Backend | FastAPI, SQLAlchemy 2, SQLite |
| Validation | Pydantic v2 |

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 20+

### Backend

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to the SQLite path for your machine (e.g. `sqlite:////home/you/notes/notes.db`). Then apply migrations to create the database schema:

```sh
alembic upgrade head
```

Uploaded files (`uploads/`) are created automatically on first run.

### Frontend

```sh
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Running as persistent services (systemd)

To have both processes start automatically at login:

```sh
ln -s ~/src/notes/systemd/notes.target ~/.config/systemd/user/
ln -s ~/src/notes/systemd/notes-backend.service ~/.config/systemd/user/
ln -s ~/src/notes/systemd/notes-frontend.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now notes.target
```

The app is then available at [http://localhost:5173](http://localhost:5173). Both services reload automatically on code changes (Vite HMR for the frontend, `--reload` for the backend).

### Desktop launcher

To add the app to GNOME's app grid:

```sh
ln -s ~/src/notes/desktop/notes.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications/
```

This opens the app via `google-chrome --app=http://localhost:5173` (no browser chrome). The services must be running for it to load.

## Project structure

```
notes/
├── backend/
│   └── app/
│       ├── main.py          # FastAPI app, router mounts
│       ├── database.py      # SQLite engine, session, Base
│       ├── models/          # SQLAlchemy models
│       ├── schemas/         # Pydantic schemas
│       └── routers/         # One router per resource
└── frontend/
    ├── public/
    │   └── djvu.js          # Pre-built DjVu.js bundle (IIFE)
    └── src/
        ├── api/             # Typed API client
        ├── components/
        │   ├── Canvas/          # Generic SVG drawing canvas
        │   ├── DocumentViewer/  # PDF + DjVu viewers, overlay, region modal
        │   ├── Layout/          # App shell with sidebar
        │   ├── NoteEditor/      # Section list + per-section canvas
        │   ├── PenToolbar/      # Color/width picker, undo/redo
        │   └── Sidebar/         # Folder/note/document tree with CRUD
        ├── pages/           # NotePage, DocumentPage, FolderPage
        └── types/           # Shared TypeScript types
```

## Usage

### Creating notes

1. Create a note in the sidebar (optionally inside a folder to group notes).
2. Open the note — add sections with **+ Add section**.
3. Draw with a stylus or mouse. Use the pen toolbar to change color and width.
4. Hover a section and press `Ctrl+Z` / `Ctrl+Shift+Z` to undo/redo.

### Annotating documents

1. Upload a PDF or DjVu file via the sidebar.
2. Open the document and click **✎ Annotate** (or press `A`).
3. Draw directly on the page. Use the pen toolbar for color, width, and undo/redo.
4. Press `Escape` to return to view mode.

### Linking a document region to a note

1. Open a document and click **⬚ Region** (or press `R`).
2. Drag a rectangle over the area of interest.
3. In the modal, select an existing note or create a new one.
4. A new section is added to that note and linked to the region.
5. Click the highlighted region box to open the side-by-side view.

### Side-by-side view

Navigate to a document and open a linked note together via the sidebar or by clicking a region. The note pane scrolls automatically to the section linked to whichever region you click.
