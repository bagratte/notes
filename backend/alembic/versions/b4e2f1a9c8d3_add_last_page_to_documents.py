"""add last_page to documents

Revision ID: b4e2f1a9c8d3
Revises: eadecf5e20c1
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e2f1a9c8d3'
down_revision: Union[str, None] = 'eadecf5e20c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('last_page', sa.Integer(), nullable=True))
    op.add_column('documents', sa.Column('last_page_updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'last_page_updated_at')
    op.drop_column('documents', 'last_page')
