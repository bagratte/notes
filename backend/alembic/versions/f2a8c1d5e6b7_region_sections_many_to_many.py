"""region sections many to many

Revision ID: f2a8c1d5e6b7
Revises: d6e7f8a9b0c1
Create Date: 2026-07-07 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f2a8c1d5e6b7'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "region_sections",
        sa.Column("region_id", sa.Integer(), sa.ForeignKey("regions.id"), nullable=False),
        sa.Column("section_id", sa.Integer(), sa.ForeignKey("sections.id"), nullable=False),
        sa.PrimaryKeyConstraint("region_id", "section_id"),
    )

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, section_id FROM regions")).fetchall()
    for region_id, section_id in rows:
        conn.execute(
            sa.text("INSERT INTO region_sections (region_id, section_id) VALUES (:region_id, :section_id)"),
            {"region_id": region_id, "section_id": section_id},
        )

    with op.batch_alter_table("regions") as batch_op:
        batch_op.drop_column("section_id")


def downgrade() -> None:
    with op.batch_alter_table("regions") as batch_op:
        batch_op.add_column(sa.Column("section_id", sa.Integer(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT region_id, section_id FROM region_sections")).fetchall()
    for region_id, section_id in rows:
        conn.execute(
            sa.text("UPDATE regions SET section_id = :section_id WHERE id = :region_id"),
            {"section_id": section_id, "region_id": region_id},
        )
    # A region linked to more than one section loses all but its last-seen link on downgrade.

    with op.batch_alter_table("regions") as batch_op:
        batch_op.alter_column("section_id", nullable=False)

    op.drop_table("region_sections")
