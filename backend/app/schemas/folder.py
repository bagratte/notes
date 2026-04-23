from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FolderCreate(BaseModel):
    parent_folder_id: Optional[int] = None
    name: str


class FolderUpdate(BaseModel):
    name: str


class FolderOut(BaseModel):
    id: int
    parent_folder_id: Optional[int]
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
