"""add portal column to user_sessions

Revision ID: l6a3c9e2f8b1
Revises: k5b7d9e1c3a4
Create Date: 2026-04-22 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l6a3c9e2f8b1'
down_revision: Union[str, None] = 'k5b7d9e1c3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable column - replicated rows from prod arrive without it (stay NULL).
    # Admin-portal code sets portal='admin' on session insert.
    op.add_column(
        'user_sessions',
        sa.Column('portal', sa.String(length=10), nullable=True),
    )

    # Backfill: existing admin-local sessions have id >= 10,000,000 (sequence offset
    # we set earlier guarantees this). Prod-replicated rows have low ids and stay NULL.
    op.execute(
        "UPDATE user_sessions SET portal = 'admin' "
        "WHERE id >= 10000000 AND portal IS NULL"
    )


def downgrade() -> None:
    op.drop_column('user_sessions', 'portal')
