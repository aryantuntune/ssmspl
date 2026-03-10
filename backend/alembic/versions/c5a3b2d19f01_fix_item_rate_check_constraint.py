"""fix item_rate check constraint to allow rate >= 1

Revision ID: c5a3b2d19f01
Revises: b4e2a1f37c98
Create Date: 2026-03-10 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c5a3b2d19f01'
down_revision: Union[str, None] = 'b4e2a1f37c98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('check_item_rate', 'item_rates', type_='check')
    op.create_check_constraint('check_item_rate', 'item_rates', 'rate >= 1')


def downgrade() -> None:
    op.drop_constraint('check_item_rate', 'item_rates', type_='check')
    op.create_check_constraint('check_item_rate', 'item_rates', 'rate > 1')
