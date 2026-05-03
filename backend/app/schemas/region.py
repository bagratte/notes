from datetime import datetime
from pydantic import BaseModel


class RegionCreate(BaseModel):
    document_id: int
    section_id: int
    page_number: int
    x: float
    y: float
    width: float
    height: float


class RegionUpdate(BaseModel):
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None


class RegionOut(BaseModel):
    id: int
    document_id: int
    section_id: int
    page_number: int
    x: float
    y: float
    width: float
    height: float
    created_at: datetime

    model_config = {"from_attributes": True}
