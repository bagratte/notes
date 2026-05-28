from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FolderCreate(BaseModel):
    parent_folder_id: Optional[int] = None
    name: str


class FolderUpdate(BaseModel):
    name: str


class FolderReorder(BaseModel):
    folder_ids: list[int]


class FolderOut(BaseModel):
    id: int
    parent_folder_id: Optional[int]
    name: str
    position: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
