from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import folders, documents, notes, sections, regions, strokes

app = FastAPI(title="Notes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(folders.router)
app.include_router(documents.router)
app.include_router(notes.router)
app.include_router(sections.router)
app.include_router(regions.router)
app.include_router(strokes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
