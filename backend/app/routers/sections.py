from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Section
from app.schemas import SectionCreate, SectionReorder, SectionOut

router = APIRouter(prefix="/sections", tags=["sections"])


@router.get("/", response_model=list[SectionOut])
def list_sections(note_id: int, db: Session = Depends(get_db)):
    return db.query(Section).filter(Section.note_id == note_id).order_by(Section.order).all()


@router.post("/", response_model=SectionOut, status_code=201)
def create_section(data: SectionCreate, db: Session = Depends(get_db)):
    section = Section(note_id=data.note_id, order=data.order)
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.get("/{section_id}", response_model=SectionOut)
def get_section(section_id: int, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404)
    return section


@router.post("/reorder", status_code=204)
def reorder_sections(data: SectionReorder, db: Session = Depends(get_db)):
    for i, section_id in enumerate(data.section_ids):
        section = db.get(Section, section_id)
        if section:
            section.order = i
    db.commit()


@router.delete("/{section_id}", status_code=204)
def delete_section(section_id: int, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404)
    db.delete(section)
    db.commit()
