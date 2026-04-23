from datetime import datetime
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    folder_id: int
    name: str
    type: str


class DocumentUpdate(BaseModel):
    name: str


class DocumentOut(BaseModel):
    id: int
    folder_id: int
    name: str
    file_path: str
    type: str
    created_at: datetime

    model_config = {"from_attributes": True}
