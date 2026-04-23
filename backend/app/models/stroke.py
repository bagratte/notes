from datetime import datetime, timezone
from sqlalchemy import Integer, Float, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from app.database import Base


class Stroke(Base):
    __tablename__ = "strokes"

    id: Mapped[int] = mapped_column(primary_key=True)
    # exactly one of these pairs is set
    section_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sections.id"), nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    points: Mapped[list] = mapped_column(JSON)  # [[x, y, pressure], ...]
    color: Mapped[str] = mapped_column(String(32), default="#000000")
    width: Mapped[float] = mapped_column(Float, default=3.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    section: Mapped[Optional["Section"]] = relationship(back_populates="strokes")
    document: Mapped[Optional["Document"]] = relationship(back_populates="strokes")
