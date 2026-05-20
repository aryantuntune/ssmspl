"""add_payment_mode_to_admin_adjustments_log

Adds payment_mode column to admin_adjustments_log so each batch records
whether it operated on CASH or UPI tickets. Existing rows default to CASH
(the only mode supported before this change).

Additive only: adds one column + one CHECK constraint. Drops/deletes nothing.

Revision ID: q2e5g7h9b3d6
Revises: p1q3r5t7v9w2
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'q2e5g7h9b3d6'
down_revision: Union[str, None] = 'p1q3r5t7v9w2'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        'admin_adjustments_log',
        sa.Column(
            'payment_mode',
            sa.String(length=10),
            nullable=False,
            server_default='CASH',
        ),
    )
    op.create_check_constraint(
        'ck_adj_log_payment_mode',
        'admin_adjustments_log',
        "payment_mode IN ('CASH','UPI')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_adj_log_payment_mode', 'admin_adjustments_log', type_='check')
    op.drop_column('admin_adjustments_log', 'payment_mode')
