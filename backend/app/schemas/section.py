from datetime import datetime
from pydantic import BaseModel


class SectionCreate(BaseModel):
    note_id: int
    order: int = 0


class SectionUpdate(BaseModel):
    order: int


class SectionReorder(BaseModel):
    section_ids: list[int]  # ordered list of all section ids for the note


class SectionOut(BaseModel):
    id: int
    note_id: int
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}
