"""add payment_transactions table

Revision ID: 2d6c867c0759
Revises:
Create Date: 2026-03-08 19:27:33.485454

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d6c867c0759'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('payment_transactions',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('booking_id', sa.BigInteger(), nullable=False),
    sa.Column('client_txn_id', sa.String(length=64), nullable=False),
    sa.Column('gateway_txn_id', sa.String(length=64), nullable=True),
    sa.Column('amount', sa.Numeric(precision=9, scale=2), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('payment_mode', sa.String(length=30), nullable=True),
    sa.Column('bank_name', sa.String(length=100), nullable=True),
    sa.Column('gateway_message', sa.String(length=255), nullable=True),
    sa.Column('raw_response', sa.Text(), nullable=True),
    sa.Column('platform', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payment_transactions_booking_id'), 'payment_transactions', ['booking_id'], unique=False)
    op.create_index(op.f('ix_payment_transactions_client_txn_id'), 'payment_transactions', ['client_txn_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_payment_transactions_client_txn_id'), table_name='payment_transactions')
    op.drop_index(op.f('ix_payment_transactions_booking_id'), table_name='payment_transactions')
    op.drop_table('payment_transactions')
