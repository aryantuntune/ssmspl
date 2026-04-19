"""add_dri_deletion_fields

Revision ID: f3a7b1e8c2d9
Revises: e1a2b3c4d5f6
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f3a7b1e8c2d9'
down_revision: Union[str, None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # parameter_master
    op.add_column('parameter_master', sa.Column('is_protected', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('parameter_master', sa.Column('min_remaining_per_item', sa.Integer(), server_default='0', nullable=False))

    # admin_adjustment_details
    op.add_column('admin_adjustment_details', sa.Column('operation_type', sa.String(length=10), server_default='MODIFY', nullable=False))
    op.create_check_constraint('ck_adj_details_op_type', 'admin_adjustment_details', "operation_type IN ('MODIFY','DELETE')")

    # admin_adjustments_log
    op.add_column('admin_adjustments_log', sa.Column('plan_choice', sa.String(length=15), nullable=True))
    op.create_check_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', "plan_choice IS NULL OR plan_choice IN ('recommended','requested')")


def downgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.drop_column('admin_adjustments_log', 'plan_choice')
    op.drop_constraint('ck_adj_details_op_type', 'admin_adjustment_details', type_='check')
    op.drop_column('admin_adjustment_details', 'operation_type')
    op.drop_column('parameter_master', 'min_remaining_per_item')
    op.drop_column('parameter_master', 'is_protected')
