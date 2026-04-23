from datetime import datetime
from typing import Optional
from pydantic import BaseModel, model_validator


class NoteCreate(BaseModel):
    folder_id: Optional[int] = None
    notebook_id: Optional[int] = None
    name: str

    @model_validator(mode="after")
    def exactly_one_parent(self) -> "NoteCreate":
        if (self.folder_id is None) == (self.notebook_id is None):
            raise ValueError("Exactly one of folder_id or notebook_id must be provided")
        return self


class NoteUpdate(BaseModel):
    name: str


class NoteOut(BaseModel):
    id: int
    folder_id: Optional[int]
    notebook_id: Optional[int]
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
