"""add_rollback_fields

Revision ID: h7e2c1d9b4a5
Revises: g5c8e9a2f3b1
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'h7e2c1d9b4a5'
down_revision: Union[str, None] = 'g5c8e9a2f3b1'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # Extend status CHECK to include ROLLED_BACK
    op.drop_constraint('ck_adj_log_status', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_status',
        'admin_adjustments_log',
        "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED','ROLLED_BACK')",
    )
    # Audit fields for the rollback
    op.add_column('admin_adjustments_log', sa.Column('rolled_back_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('admin_adjustments_log', sa.Column('rolled_back_by', postgresql.UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column('admin_adjustments_log', 'rolled_back_by')
    op.drop_column('admin_adjustments_log', 'rolled_back_at')
    op.drop_constraint('ck_adj_log_status', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_status',
        'admin_adjustments_log',
        "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED')",
    )
