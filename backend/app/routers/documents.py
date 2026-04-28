import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document
from app.schemas import DocumentUpdate, DocumentOut

UPLOADS_DIR = os.environ.get("DOCUMENT_ROOT") or os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../uploads")
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=list[DocumentOut])
def list_documents(folder_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Document)
    if folder_id is not None:
        q = q.filter(Document.folder_id == folder_id)
    return q.all()


@router.post("/", response_model=DocumentOut, status_code=201)
def upload_document(
    folder_id: int | None = Form(None),
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[-1].lower().lstrip(".")
    if ext not in ("pdf", "djvu"):
        raise HTTPException(400, "Only PDF and DjVu files are supported")

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    dest = os.path.join(UPLOADS_DIR, file.filename or f"upload.{ext}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = Document(folder_id=folder_id, name=name, file_path=dest, type=ext)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    return doc


@router.get("/{document_id}/file")
def serve_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    if not os.path.exists(doc.file_path):
        raise HTTPException(404, "File not found on disk")
    return FileResponse(doc.file_path)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(document_id: int, data: DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    doc.name = data.name
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
