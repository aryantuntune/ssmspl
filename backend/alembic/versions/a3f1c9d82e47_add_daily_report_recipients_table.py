"""add daily_report_recipients table

Revision ID: a3f1c9d82e47
Revises: 8bfe9649daad
Create Date: 2026-03-09 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f1c9d82e47'
down_revision: Union[str, None] = '8bfe9649daad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'daily_report_recipients',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_daily_report_recipients_email', 'daily_report_recipients', ['email'])


def downgrade() -> None:
    op.drop_index('ix_daily_report_recipients_email', table_name='daily_report_recipients')
    op.drop_table('daily_report_recipients')
