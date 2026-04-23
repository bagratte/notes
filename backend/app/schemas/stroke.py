from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StrokeCreate(BaseModel):
    section_id: Optional[int] = None
    document_id: Optional[int] = None
    page_number: Optional[int] = None
    points: list[list[float]]  # [[x, y, pressure], ...]
    color: str = "#000000"
    width: float = 3.0


class StrokeBatchCreate(BaseModel):
    strokes: list[StrokeCreate]


class StrokeOut(BaseModel):
    id: int
    section_id: Optional[int]
    document_id: Optional[int]
    page_number: Optional[int]
    points: list[list[float]]
    color: str
    width: float
    created_at: datetime

    model_config = {"from_attributes": True}
