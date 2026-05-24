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
cp .env.example .env          # then set DATABASE_URL and DOCUMENT_ROOT
uvicorn app.main:app --reload --port 8000
```

Both env vars have defaults if unset: `DATABASE_URL` falls back to `backend/notes.db`; `DOCUMENT_ROOT` falls back to `backend/uploads/`.

**Frontend** — from `frontend/`:
```sh
npm install                   # first time only
npm run dev                   # Vite dev server on :5173
```

The frontend proxies `/api` → `http://localhost:8000` (Vite config). There is a `GET /health` endpoint for liveness checks.

The backend allows CORS only from `http://localhost:5173` — direct browser requests from any other origin will be blocked.

## Backend commands

There is no test suite or linter configured.

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

## Desktop launcher

`desktop/notes.desktop` launches the app in Chrome app mode. To install:

```sh
ln -s ~/src/notes/desktop/notes.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications/
```

> `StartupWMClass` in the desktop file may need tuning. Verify with `xprop WM_CLASS` after first launch and update if the window isn't grouped with the launcher.

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

`Document.last_page` (nullable int) and `Document.last_page_updated_at` (nullable datetime) track the last-read page for cross-device sync. `last_page_updated_at` is stamped server-side whenever `last_page` is written. SQLite stores datetimes without timezone info, so the frontend must treat them as UTC (append `Z` before parsing).

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
| GET | `/strokes/annotated-pages` | requires `document_id`; returns `{ pages: number[] }` — distinct page numbers with inline strokes |
| GET | `/sections/` | requires `note_id`; ordered by `order` |
| POST | `/sections/` | create section (`note_id`, `order`) |
| GET/PATCH/DELETE | `/sections/{id}` | PATCH updates `height` only |
| POST | `/sections/reorder` | body: `{ section_ids: number[] }` — sets order by array index |
| GET/POST | `/regions/` | filter by `document_id`, `page_number`, `section_id` |
| PATCH | `/regions/{id}` | partial update of geometry fields |
| DELETE | `/regions/{id}` | delete a region |
| GET/POST | `/folders/` | list accepts optional `parent_folder_id`; POST body: `{ name, parent_folder_id? }` |
| GET/PATCH/DELETE | `/folders/{id}` | PATCH updates `name` only |
| GET/POST | `/notes/` | GET: optional `folder_id`, `document_id` filters (latter returns notes linked via regions) |
| GET/PATCH/DELETE | `/notes/{id}` | PATCH updates `name` only |
| POST | `/notes/{id}/merge` | body: `{ target_note_id }` — moves all sections, deletes source note |
| GET/POST | `/documents/` | POST is multipart: optional `folder_id` + `name` + `file` |
| GET/PATCH/DELETE | `/documents/{id}` | PATCH updates `name` and/or `last_page` (both optional); writing `last_page` auto-stamps `last_page_updated_at` |
| GET | `/documents/{id}/file` | serves the raw file from disk |

## Frontend

The frontend is a React + TypeScript + Vite app — see `frontend/CLAUDE.md` for architecture details.
