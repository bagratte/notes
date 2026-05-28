from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Folder
from app.schemas import FolderCreate, FolderUpdate, FolderOut, FolderReorder

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("/", response_model=list[FolderOut])
def list_folders(parent_folder_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Folder)
    if parent_folder_id is not None:
        q = q.filter(Folder.parent_folder_id == parent_folder_id)
    return q.order_by(Folder.position.nulls_last(), Folder.id).all()


@router.post("/reorder", status_code=204)
def reorder_folders(data: FolderReorder, db: Session = Depends(get_db)):
    for i, folder_id in enumerate(data.folder_ids):
        folder = db.get(Folder, folder_id)
        if folder:
            folder.position = i
    db.commit()


@router.post("/", response_model=FolderOut, status_code=201)
def create_folder(data: FolderCreate, db: Session = Depends(get_db)):
    folder = Folder(parent_folder_id=data.parent_folder_id, name=data.name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderOut)
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404)
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
def update_folder(folder_id: int, data: FolderUpdate, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404)
    folder.name = data.name
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404)
    db.delete(folder)
    db.commit()
