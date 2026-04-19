"""add admin_screen_toggles table

Revision ID: 2f7ebc290580
Revises: c3d5e7f9a1b2
Create Date: 2026-04-10 23:47:51.422870

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2f7ebc290580'
down_revision: Union[str, None] = 'c3d5e7f9a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('admin_screen_toggles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('screen_name', sa.String(length=50), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('updated_by', sa.UUID(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('screen_name')
    )


def downgrade() -> None:
    op.drop_table('admin_screen_toggles')
