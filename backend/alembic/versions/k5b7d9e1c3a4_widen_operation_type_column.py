"""widen_operation_type_column

Widens admin_adjustment_details.operation_type from VARCHAR(10) to VARCHAR(20)
so TRANSFER_UPDATE (15 chars) and TRANSFER_INSERT (15 chars) fit. The CHECK
constraint already allows these values but the column was too narrow.

Revision ID: k5b7d9e1c3a4
Revises: j4a6b8c0d2e5
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'k5b7d9e1c3a4'
down_revision: Union[str, None] = 'j4a6b8c0d2e5'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.alter_column(
        'admin_adjustment_details',
        'operation_type',
        type_=sa.String(length=20),
        existing_type=sa.String(length=10),
        existing_nullable=False,
        existing_server_default='MODIFY',
    )


def downgrade() -> None:
    op.alter_column(
        'admin_adjustment_details',
        'operation_type',
        type_=sa.String(length=10),
        existing_type=sa.String(length=20),
        existing_nullable=False,
        existing_server_default='MODIFY',
    )
