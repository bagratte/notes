from datetime import datetime
from pydantic import BaseModel


class NotebookCreate(BaseModel):
    name: str


class NotebookUpdate(BaseModel):
    name: str


class NotebookOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
