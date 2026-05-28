from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    last_page: Optional[int] = None


class DocumentOut(BaseModel):
    id: int
    folder_id: Optional[int]
    name: str
    type: str
    created_at: datetime
    last_page: Optional[int]
    last_page_updated_at: Optional[datetime]

    model_config = {"from_attributes": True}
