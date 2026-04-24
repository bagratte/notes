from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NoteCreate(BaseModel):
    folder_id: Optional[int] = None
    name: str


class NoteUpdate(BaseModel):
    name: str


class NoteMerge(BaseModel):
    target_note_id: int


class NoteOut(BaseModel):
    id: int
    folder_id: Optional[int]
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
