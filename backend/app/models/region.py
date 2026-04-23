from datetime import datetime, timezone
from sqlalchemy import Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id"))
    page_number: Mapped[int] = mapped_column(Integer)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    document: Mapped["Document"] = relationship(back_populates="regions")
    section: Mapped["Section"] = relationship(back_populates="regions")
