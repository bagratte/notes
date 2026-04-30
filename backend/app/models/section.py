from datetime import datetime, timezone
from sqlalchemy import Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id"))
    order: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=320)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    note: Mapped["Note"] = relationship(back_populates="sections")
    regions: Mapped[list["Region"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    strokes: Mapped[list["Stroke"]] = relationship(back_populates="section", cascade="all, delete-orphan")
