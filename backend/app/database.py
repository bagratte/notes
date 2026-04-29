import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL") or (
    "sqlite:///" + os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../notes.db")
    )
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=NullPool
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
