from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Stroke
from app.schemas import StrokeCreate, StrokeBatchCreate, StrokeOut

router = APIRouter(prefix="/strokes", tags=["strokes"])


@router.get("/", response_model=list[StrokeOut])
def list_strokes(
    section_id: int | None = None,
    document_id: int | None = None,
    page_number: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Stroke)
    if section_id is not None:
        q = q.filter(Stroke.section_id == section_id)
    if document_id is not None:
        q = q.filter(Stroke.document_id == document_id)
    if page_number is not None:
        q = q.filter(Stroke.page_number == page_number)
    return q.all()


@router.post("/", response_model=StrokeOut, status_code=201)
def create_stroke(data: StrokeCreate, db: Session = Depends(get_db)):
    stroke = Stroke(**data.model_dump())
    db.add(stroke)
    db.commit()
    db.refresh(stroke)
    return stroke


@router.post("/batch", response_model=list[StrokeOut], status_code=201)
def create_strokes_batch(data: StrokeBatchCreate, db: Session = Depends(get_db)):
    strokes = [Stroke(**s.model_dump()) for s in data.strokes]
    db.add_all(strokes)
    db.commit()
    for s in strokes:
        db.refresh(s)
    return strokes


@router.delete("/{stroke_id}", status_code=204)
def delete_stroke(stroke_id: int, db: Session = Depends(get_db)):
    stroke = db.get(Stroke, stroke_id)
    if not stroke:
        raise HTTPException(404)
    db.delete(stroke)
    db.commit()


@router.delete("/", status_code=204)
def delete_strokes(
    section_id: int | None = None,
    document_id: int | None = None,
    page_number: int | None = None,
    db: Session = Depends(get_db),
):
    """Bulk delete strokes for a section or document page (used by undo/clear)."""
    q = db.query(Stroke)
    if section_id is not None:
        q = q.filter(Stroke.section_id == section_id)
    elif document_id is not None and page_number is not None:
        q = q.filter(Stroke.document_id == document_id, Stroke.page_number == page_number)
    else:
        raise HTTPException(400, "Provide section_id or document_id+page_number")
    q.delete()
    db.commit()
