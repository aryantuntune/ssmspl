"""extend_plan_choice_for_transfer

Revision ID: j4a6b8c0d2e5
Revises: i9d3e5f7a8b2
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Union
from alembic import op

revision: str = 'j4a6b8c0d2e5'
down_revision: Union[str, None] = 'i9d3e5f7a8b2'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_plan_choice',
        'admin_adjustments_log',
        "plan_choice IS NULL OR plan_choice IN ('recommended','requested','transfer')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_plan_choice',
        'admin_adjustments_log',
        "plan_choice IS NULL OR plan_choice IN ('recommended','requested')",
    )
