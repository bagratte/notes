import os
from datetime import datetime, timezone
from urllib.parse import urlparse, quote
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document
from app.schemas import DocumentFromUrl, DocumentUpdate, DocumentOut, DocumentReorder

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "djvu": "image/vnd.djvu",
}

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=list[DocumentOut])
def list_documents(folder_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Document)
    if folder_id is not None:
        q = q.filter(Document.folder_id == folder_id)
    return q.order_by(Document.position.nulls_last(), Document.id).all()


@router.post("/reorder", status_code=204)
def reorder_documents(data: DocumentReorder, db: Session = Depends(get_db)):
    for i, document_id in enumerate(data.document_ids):
        doc = db.get(Document, document_id)
        if doc:
            doc.position = i
    db.commit()


@router.post("/", response_model=DocumentOut, status_code=201)
async def upload_document(
    folder_id: int | None = Form(None),
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[-1].lower().lstrip(".")
    if ext not in ("pdf", "djvu"):
        raise HTTPException(400, "Only PDF and DjVu files are supported")

    content = await file.read()
    doc = Document(folder_id=folder_id, name=name, file_data=content, type=ext)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


CONTENT_TYPE_EXT = {
    "application/pdf": "pdf",
    "image/vnd.djvu": "djvu",
    "image/x-djvu": "djvu",
}


@router.post("/from-url", response_model=DocumentOut, status_code=201)
async def upload_document_from_url(data: DocumentFromUrl, db: Session = Depends(get_db)):
    # Derive extension from URL path first, then fall back to Content-Type
    path = urlparse(data.url).path
    ext = os.path.splitext(path)[-1].lower().lstrip(".")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            response = await client.get(data.url)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Remote server returned {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(502, f"Failed to fetch URL: {e}")

    if ext not in ("pdf", "djvu"):
        ct = response.headers.get("content-type", "").split(";")[0].strip()
        ext = CONTENT_TYPE_EXT.get(ct, "")

    if ext not in ("pdf", "djvu"):
        raise HTTPException(400, "URL does not point to a PDF or DjVu file")

    content = response.content
    doc = Document(folder_id=data.folder_id, name=data.name, file_data=content, type=ext)
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
    media_type = MEDIA_TYPES.get(doc.type, "application/octet-stream")
    return Response(
        content=doc.file_data,
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(doc.name + '.' + doc.type)}"},
    )


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(document_id: int, data: DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    if data.name is not None:
        doc.name = data.name
    if data.last_page is not None:
        doc.last_page = data.last_page
        doc.last_page_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404)
    db.delete(doc)
    db.commit()
