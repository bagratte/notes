from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(ForeignKey("notebooks.id"))
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="folders")
    documents: Mapped[list["Document"]] = relationship(back_populates="folder", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(back_populates="folder", cascade="all, delete-orphan")
