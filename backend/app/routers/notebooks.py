from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Notebook
from app.schemas import NotebookCreate, NotebookUpdate, NotebookOut

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


@router.get("/", response_model=list[NotebookOut])
def list_notebooks(db: Session = Depends(get_db)):
    return db.query(Notebook).all()


@router.post("/", response_model=NotebookOut, status_code=201)
def create_notebook(data: NotebookCreate, db: Session = Depends(get_db)):
    nb = Notebook(name=data.name)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    return nb


@router.get("/{notebook_id}", response_model=NotebookOut)
def get_notebook(notebook_id: int, db: Session = Depends(get_db)):
    nb = db.get(Notebook, notebook_id)
    if not nb:
        raise HTTPException(404)
    return nb


@router.patch("/{notebook_id}", response_model=NotebookOut)
def update_notebook(notebook_id: int, data: NotebookUpdate, db: Session = Depends(get_db)):
    nb = db.get(Notebook, notebook_id)
    if not nb:
        raise HTTPException(404)
    nb.name = data.name
    db.commit()
    db.refresh(nb)
    return nb


@router.delete("/{notebook_id}", status_code=204)
def delete_notebook(notebook_id: int, db: Session = Depends(get_db)):
    nb = db.get(Notebook, notebook_id)
    if not nb:
        raise HTTPException(404)
    db.delete(nb)
    db.commit()
