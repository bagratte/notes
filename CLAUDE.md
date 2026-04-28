# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

```
notes/
  backend/   FastAPI + SQLAlchemy + SQLite
  frontend/  React + TypeScript + Vite
```

See `frontend/CLAUDE.md` for frontend-specific guidance.

## Running the app

**Backend** — from `backend/`:
```sh
python -m venv .venv          # first time only
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set DATABASE_URL
uvicorn app.main:app --reload --port 8000
```

**Frontend** — from `frontend/`:
```sh
npm install                   # first time only
npm run dev                   # Vite dev server on :5173
```

The frontend proxies `/api` → `http://localhost:8000` (Vite config). There is a `GET /health` endpoint for liveness checks.

## Running as services

Unit files live in `systemd/`. To install:

```sh
ln -s ~/src/notes/systemd/notes.target ~/.config/systemd/user/
ln -s ~/src/notes/systemd/notes-backend.service ~/.config/systemd/user/
ln -s ~/src/notes/systemd/notes-frontend.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now notes.target
```

Frontend runs on `:5173` (Vite dev server with HMR). Backend reloads on Python file changes (`--reload`).

## Backend architecture

### Schema management

Alembic is configured. Migrations live in `backend/alembic/versions/`. To apply pending migrations:

```sh
cd backend && alembic upgrade head
```

To create a migration after editing a model:

```sh
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

`create_all` is no longer used — schema changes must go through Alembic.

### Data model

```
Folder → Folder (nested, parent_folder_id self-FK, nullable = root)
Folder → (Note | Document)
Note (folder_id null = root level)
Document (folder_id null = root level)
Note → Section
Section ← Stroke  (section_id set,   document_id null)
Document ← Stroke (document_id set,  section_id null, page_number set)
Region: (document_id, page_number, x, y, width, height) → section_id
```

Folders are arbitrarily nested. Top-level folders have `parent_folder_id = NULL`. Notes and Documents have an optional `folder_id` — `NULL` means root level (no folder). There are no Notebooks.

`Stroke.points` is stored as JSON (`[[x, y, pressure], ...]`) in natural page coordinates (scale 1.0).

`Document.type` (`"pdf"` or `"djvu"`) is derived from the uploaded file's extension — the client never sends it. Uploaded files land in `backend/uploads/`; the absolute path is stored in `Document.file_path`.

### Router patterns

All routers follow the same pattern: `Depends(get_db)` for the session, `db.get(Model, id)` for single lookups, `db.query(Model).filter(...)` for lists. Schemas use `model_config = {"from_attributes": True}` (Pydantic v2 ORM mode).

The strokes router has two delete endpoints that are easy to confuse:
- `DELETE /strokes/{stroke_id}` — delete one stroke by ID (used for per-stroke undo)
- `DELETE /strokes/` — bulk delete by `section_id` OR `document_id + page_number` (used for clear-all)

### Key API routes

| Method | Path | Notes |
|--------|------|-------|
| GET | `/strokes/` | filter by `section_id` OR `document_id + page_number` |
| POST | `/strokes/` | returns saved stroke with `id` (required for undo) |
| POST | `/strokes/batch` | bulk create |
| DELETE | `/strokes/{id}` | per-stroke delete |
| DELETE | `/strokes/` | bulk delete by section or page |
| GET/POST | `/regions/` | filter by `document_id`, `page_number`, `section_id` |
| POST | `/documents/` | multipart: optional `folder_id` + `name` + `file` |
| GET | `/documents/{id}/file` | serves the raw file from disk |

## Target platform

The app targets **touch-only devices** (tablets, iPads) as the primary platform. Consequences:
- Minimum tap target size: 44px
- Never rely on `:hover` for functionality — use `@media (pointer: coarse)` to show actions that would otherwise be hover-only
- Prefer pointer events over mouse/touch events
- Sidebar uses overlay mode on touch (position: fixed, backdrop to dismiss)

## Frontend summary

- Three routes under `AppLayout` (sidebar + outlet): `/notes/:noteId`, `/documents/:documentId`, `/folders/:folderId`
- `TouchModeProvider` context (persisted to `localStorage`) is the only global state — everything else is local component state + direct API calls
- CSS Modules for all styles
- Drawing is SVG-based using `perfect-freehand`; strokes stored in natural page coordinates
- DjVu.js loaded as a pre-built IIFE global (`public/djvu.js`) — not importable as a module

See `frontend/CLAUDE.md` for the coordinate system, undo/redo design, tool modes, and keyboard shortcuts.
