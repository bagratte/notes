from datetime import datetime
from pydantic import BaseModel


class NoteCreate(BaseModel):
    folder_id: int
    name: str


class NoteUpdate(BaseModel):
    name: str


class NoteOut(BaseModel):
    id: int
    folder_id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
