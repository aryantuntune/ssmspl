"""add vehicle_name to ticket_items

Revision ID: b4e2a1f37c98
Revises: 8bfe9649daad
Create Date: 2026-03-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4e2a1f37c98'
down_revision: Union[str, None] = '8bfe9649daad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ticket_items', sa.Column('vehicle_name', sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column('ticket_items', 'vehicle_name')
