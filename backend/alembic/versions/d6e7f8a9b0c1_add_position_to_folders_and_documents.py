"""add position to folders and documents

Revision ID: d6e7f8a9b0c1
Revises: a1f3e8c2d904
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'a1f3e8c2d904'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("folders") as batch_op:
        batch_op.add_column(sa.Column("position", sa.Integer(), nullable=True))

    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(sa.Column("position", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("folders") as batch_op:
        batch_op.drop_column("position")

    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_column("position")
