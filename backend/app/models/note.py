from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    folder: Mapped[Optional["Folder"]] = relationship(back_populates="notes")
    sections: Mapped[list["Section"]] = relationship(back_populates="note", cascade="all, delete-orphan", order_by="Section.order")
