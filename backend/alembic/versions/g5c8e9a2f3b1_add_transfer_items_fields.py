"""add_transfer_items_fields

Revision ID: g5c8e9a2f3b1
Revises: f3a7b1e8c2d9
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g5c8e9a2f3b1'
down_revision: Union[str, None] = 'f3a7b1e8c2d9'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # parameter_master: add transfer allowlist flags
    op.add_column('parameter_master', sa.Column('allowed_as_transfer_from', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('parameter_master', sa.Column('allowed_as_transfer_to', sa.Boolean(), server_default='false', nullable=False))

    # admin_adjustment_details: extend operation_type CHECK
    op.drop_constraint('ck_adj_details_op_type', 'admin_adjustment_details', type_='check')
    op.create_check_constraint(
        'ck_adj_details_op_type',
        'admin_adjustment_details',
        "operation_type IN ('MODIFY','DELETE','TRANSFER_UPDATE','TRANSFER_INSERT')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_adj_details_op_type', 'admin_adjustment_details', type_='check')
    op.create_check_constraint(
        'ck_adj_details_op_type',
        'admin_adjustment_details',
        "operation_type IN ('MODIFY','DELETE')",
    )
    op.drop_column('parameter_master', 'allowed_as_transfer_to')
    op.drop_column('parameter_master', 'allowed_as_transfer_from')
