from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_folder_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    parent: Mapped[Optional["Folder"]] = relationship(back_populates="children", remote_side="Folder.id")
    children: Mapped[list["Folder"]] = relationship(back_populates="parent", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(back_populates="folder", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(back_populates="folder", cascade="all, delete-orphan")
