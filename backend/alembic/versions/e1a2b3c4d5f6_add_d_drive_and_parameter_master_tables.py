"""add_d_drive_and_parameter_master_tables

Revision ID: e1a2b3c4d5f6
Revises: 2f7ebc290580
Create Date: 2026-04-18 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, None] = '2f7ebc290580'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # --- admin_user_access ---
    op.create_table(
        'admin_user_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_granted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_super_admin', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('granted_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    # --- parameter_master ---
    op.create_table(
        'parameter_master',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('priority_order', sa.Integer(), nullable=False),
        sa.Column('branch_scope', sa.Integer(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.Column('payment_mode', sa.String(length=20), server_default='CASH', nullable=False),
        sa.Column('ticket_conditions', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('item_conditions', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('ticket_selection_order', sa.String(length=20), server_default='FIFO', nullable=False),
        sa.Column('max_adjustment_per_ticket', sa.Numeric(9, 2), nullable=True),
        sa.Column('max_adjustment_per_item', sa.Numeric(9, 2), nullable=True),
        sa.Column('max_total_adjustment_per_rule', sa.Numeric(9, 2), nullable=True),
        sa.Column('stop_on_match', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "ticket_selection_order IN ('FIFO','LIFO','HIGHEST_VALUE','LOWEST_VALUE')",
            name='ck_pm_selection_order',
        ),
        sa.ForeignKeyConstraint(['branch_scope'], ['branches.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['item_id'], ['items.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('priority_order'),
    )

    # --- admin_adjustments_log (must be created before its FK dependents) ---
    op.create_table(
        'admin_adjustments_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('date_range_start', sa.Date(), nullable=False),
        sa.Column('date_range_end', sa.Date(), nullable=False),
        sa.Column('adjustment_amount', sa.Numeric(9, 2), nullable=False),
        sa.Column('dry_run_summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('total_tickets_affected', sa.Integer(), nullable=True),
        sa.Column('total_items_affected', sa.Integer(), nullable=True),
        sa.Column('row_count_checked', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='DRY_RUN', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED')",
            name='ck_adj_log_status',
        ),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # --- admin_adjustment_details (depends on admin_adjustments_log + parameter_master) ---
    op.create_table(
        'admin_adjustment_details',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('adjustment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('ticket_id', sa.BigInteger(), nullable=False),
        sa.Column('ticket_item_id', sa.BigInteger(), nullable=False),
        sa.Column('old_rate', sa.Numeric(9, 2), nullable=False),
        sa.Column('old_levy', sa.Numeric(9, 2), nullable=False),
        sa.Column('new_rate', sa.Numeric(9, 2), nullable=False),
        sa.Column('new_levy', sa.Numeric(9, 2), nullable=False),
        sa.Column('rate_delta', sa.Numeric(9, 2), nullable=False),
        sa.Column('levy_delta', sa.Numeric(9, 2), nullable=False),
        sa.Column('total_delta', sa.Numeric(9, 2), nullable=False),
        sa.Column('matched_rule_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['adjustment_id'], ['admin_adjustments_log.id']),
        sa.ForeignKeyConstraint(['matched_rule_id'], ['parameter_master.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # --- tickets_backup (depends on admin_adjustments_log) ---
    op.create_table(
        'tickets_backup',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('adjustment_batch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('ticket_id', sa.BigInteger(), nullable=False),
        sa.Column('original_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('backed_up_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['adjustment_batch_id'], ['admin_adjustments_log.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tickets_backup_batch_ticket', 'tickets_backup', ['adjustment_batch_id', 'ticket_id'])
    op.create_index(op.f('ix_tickets_backup_ticket_id'), 'tickets_backup', ['ticket_id'])

    # --- ticket_items_backup (depends on admin_adjustments_log) ---
    op.create_table(
        'ticket_items_backup',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('adjustment_batch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('ticket_item_id', sa.BigInteger(), nullable=False),
        sa.Column('ticket_id', sa.BigInteger(), nullable=False),
        sa.Column('original_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('backed_up_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['adjustment_batch_id'], ['admin_adjustments_log.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ticket_items_backup_batch_item', 'ticket_items_backup', ['adjustment_batch_id', 'ticket_item_id'])
    op.create_index(op.f('ix_ticket_items_backup_ticket_item_id'), 'ticket_items_backup', ['ticket_item_id'])

    # --- Add last_adjustment_id column to ticket_items ---
    op.add_column(
        'ticket_items',
        sa.Column('last_adjustment_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_ticket_items_last_adjustment_id',
        'ticket_items',
        'admin_adjustments_log',
        ['last_adjustment_id'],
        ['id'],
    )


def downgrade() -> None:
    # Drop FK and column from ticket_items first
    op.drop_constraint('fk_ticket_items_last_adjustment_id', 'ticket_items', type_='foreignkey')
    op.drop_column('ticket_items', 'last_adjustment_id')

    # Drop backup tables
    op.drop_index(op.f('ix_ticket_items_backup_ticket_item_id'), table_name='ticket_items_backup')
    op.drop_index('ix_ticket_items_backup_batch_item', table_name='ticket_items_backup')
    op.drop_table('ticket_items_backup')

    op.drop_index(op.f('ix_tickets_backup_ticket_id'), table_name='tickets_backup')
    op.drop_index('ix_tickets_backup_batch_ticket', table_name='tickets_backup')
    op.drop_table('tickets_backup')

    # Drop detail table (depends on adjustments_log + parameter_master)
    op.drop_table('admin_adjustment_details')

    # Drop adjustments_log
    op.drop_table('admin_adjustments_log')

    # Drop parameter_master
    op.drop_table('parameter_master')

    # Drop admin_user_access
    op.drop_table('admin_user_access')
