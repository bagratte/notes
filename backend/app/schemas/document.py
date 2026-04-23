from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DocumentUpdate(BaseModel):
    name: str


class DocumentOut(BaseModel):
    id: int
    folder_id: Optional[int]
    notebook_id: Optional[int]
    name: str
    file_path: str
    type: str
    created_at: datetime

    model_config = {"from_attributes": True}
