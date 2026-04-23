from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(ForeignKey("folders.id"))
    name: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(1024))
    type: Mapped[str] = mapped_column(String(10))  # pdf | djvu
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    folder: Mapped["Folder"] = relationship(back_populates="documents")
    regions: Mapped[list["Region"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    strokes: Mapped[list["Stroke"]] = relationship(back_populates="document", cascade="all, delete-orphan")
