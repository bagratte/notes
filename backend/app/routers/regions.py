from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Region, Section
from app.schemas import RegionCreate, RegionUpdate, RegionOut, RegionLinkSection

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("/", response_model=list[RegionOut])
def list_regions(
    document_id: int | None = None,
    section_id: int | None = None,
    page_number: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Region)
    if document_id is not None:
        q = q.filter(Region.document_id == document_id)
    if section_id is not None:
        q = q.join(Region.sections).filter(Section.id == section_id)
    if page_number is not None:
        q = q.filter(Region.page_number == page_number)
    return q.all()


@router.post("/", response_model=RegionOut, status_code=201)
def create_region(data: RegionCreate, db: Session = Depends(get_db)):
    section = db.get(Section, data.section_id)
    if not section:
        raise HTTPException(404)
    region = Region(**data.model_dump(exclude={"section_id"}))
    region.sections.append(section)
    db.add(region)
    db.commit()
    db.refresh(region)
    return region


@router.get("/{region_id}", response_model=RegionOut)
def get_region(region_id: int, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404)
    return region


@router.patch("/{region_id}", response_model=RegionOut)
def update_region(region_id: int, data: RegionUpdate, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404)

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return region

    for field, value in updates.items():
        setattr(region, field, value)

    db.commit()
    db.refresh(region)
    return region


@router.post("/{region_id}/sections", response_model=RegionOut, status_code=201)
def link_region_section(region_id: int, data: RegionLinkSection, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404)
    section = db.get(Section, data.section_id)
    if not section:
        raise HTTPException(404)
    if section not in region.sections:
        region.sections.append(section)
        db.commit()
        db.refresh(region)
    return region


@router.delete("/{region_id}", status_code=204)
def delete_region(region_id: int, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404)
    db.delete(region)
    db.commit()
