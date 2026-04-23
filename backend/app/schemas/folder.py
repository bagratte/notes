from datetime import datetime
from pydantic import BaseModel


class FolderCreate(BaseModel):
    notebook_id: int
    name: str


class FolderUpdate(BaseModel):
    name: str


class FolderOut(BaseModel):
    id: int
    notebook_id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
