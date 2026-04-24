from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Note, Section, Region
from app.schemas import NoteCreate, NoteUpdate, NoteOut, NoteMerge

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/", response_model=list[NoteOut])
def list_notes(folder_id: int | None = None, document_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Note)
    if folder_id is not None:
        q = q.filter(Note.folder_id == folder_id)
    if document_id is not None:
        q = (q.join(Section, Note.id == Section.note_id)
               .join(Region, Section.id == Region.section_id)
               .filter(Region.document_id == document_id)
               .distinct())
    return q.all()


@router.post("/", response_model=NoteOut, status_code=201)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    note = Note(folder_id=data.folder_id, name=data.name)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404)
    note.name = data.name
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404)
    db.delete(note)
    db.commit()


@router.post("/{note_id}/merge", status_code=204)
def merge_note(note_id: int, data: NoteMerge, db: Session = Depends(get_db)):
    if note_id == data.target_note_id:
        raise HTTPException(400, "Cannot merge a note into itself")
    source = db.get(Note, note_id)
    target = db.get(Note, data.target_note_id)
    if not source or not target:
        raise HTTPException(404)
    max_order = db.query(func.max(Section.order)).filter(Section.note_id == data.target_note_id).scalar()
    base = (max_order + 1) if max_order is not None else 0
    source_sections = (
        db.query(Section).filter(Section.note_id == note_id).order_by(Section.order).all()
    )
    for i, section in enumerate(source_sections):
        section.note_id = data.target_note_id
        section.order = base + i
    db.flush()
    db.delete(source)
    db.commit()
