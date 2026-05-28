"""store document content as blob

Revision ID: a1f3e8c2d904
Revises: b4e2f1a9c8d3
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f3e8c2d904'
down_revision: Union[str, None] = 'b4e2f1a9c8d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(sa.Column("file_data", sa.LargeBinary(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, file_path FROM documents")).fetchall()
    for doc_id, file_path in rows:
        with open(file_path, "rb") as f:
            data = f.read()
        conn.execute(
            sa.text("UPDATE documents SET file_data = :data WHERE id = :id"),
            {"data": data, "id": doc_id},
        )

    with op.batch_alter_table("documents") as batch_op:
        batch_op.alter_column("file_data", nullable=False)
        batch_op.drop_column("file_path")


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(sa.Column("file_path", sa.String(1024), nullable=True))
        batch_op.drop_column("file_data")
    # Downgrade does not restore files to disk; recover from backup if needed.
