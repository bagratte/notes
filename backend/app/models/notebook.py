from datetime import datetime, timezone
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    folders: Mapped[list["Folder"]] = relationship(back_populates="notebook", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(back_populates="notebook", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(back_populates="notebook", cascade="all, delete-orphan")
