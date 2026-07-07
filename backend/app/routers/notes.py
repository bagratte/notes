from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Note, Section, Region
from app.models.region import region_sections
from app.schemas import NoteCreate, NoteUpdate, NoteOut
from app.services.regions import cleanup_orphaned

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/", response_model=list[NoteOut])
def list_notes(folder_id: int | None = None, document_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Note)
    if folder_id is not None:
        q = q.filter(Note.folder_id == folder_id)
    if document_id is not None:
        q = (q.join(Section, Note.id == Section.note_id)
               .join(region_sections, Section.id == region_sections.c.section_id)
               .join(Region, Region.id == region_sections.c.region_id)
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
    region_ids = [r.id for section in note.sections for r in section.regions]
    db.delete(note)
    db.commit()
    cleanup_orphaned(db, region_ids)
