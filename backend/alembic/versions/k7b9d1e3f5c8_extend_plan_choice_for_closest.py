"""extend_plan_choice_for_closest

Revision ID: k7b9d1e3f5c8
Revises: l6a3c9e2f8b1
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Union
from alembic import op

revision: str = 'k7b9d1e3f5c8'
down_revision: Union[str, None] = 'l6a3c9e2f8b1'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_plan_choice',
        'admin_adjustments_log',
        "plan_choice IS NULL OR plan_choice IN ('recommended','requested','transfer','closest')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.create_check_constraint(
        'ck_adj_log_plan_choice',
        'admin_adjustments_log',
        "plan_choice IS NULL OR plan_choice IN ('recommended','requested','transfer')",
    )
