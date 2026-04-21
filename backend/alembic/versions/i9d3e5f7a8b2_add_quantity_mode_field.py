"""add_quantity_mode_field

Revision ID: i9d3e5f7a8b2
Revises: h7e2c1d9b4a5
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i9d3e5f7a8b2'
down_revision: Union[str, None] = 'h7e2c1d9b4a5'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # Nullable INT — when set, this row designates the row's item_id (or referenced id)
    # as a quantity-mode transfer target. Controls which TO items use the value-preserving
    # quantity-based transformation in the Transfer Items engine.
    op.add_column(
        'parameter_master',
        sa.Column('quantity_mode_item_id', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('parameter_master', 'quantity_mode_item_id')
