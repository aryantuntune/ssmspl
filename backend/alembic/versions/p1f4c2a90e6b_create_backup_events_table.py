"""create backup_events table

Revision ID: p1f4c2a90e6b
Revises: n9d1e3f5a8b2
Create Date: 2026-05-15 08:58:49.397443

Stores one row per backup attempt (db_dump + snapshot, both servers).
Populated by a laptop-side collector via POST /api/backups/events; read by
the SuperAdmin mobile app to render a unified cross-server backup history.

Dedupe key is (server_id, file_name, sha256) — enforced in application
code (the POST endpoint queries before insert), NOT a DB unique constraint,
because failed attempts with sha256=NULL must be allowed to coexist with
the same file_name.

Indexes match the two read patterns:
  - per-server feed:   (server_id, occurred_at DESC)
  - recent failures:   (status, occurred_at DESC)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p1f4c2a90e6b'
down_revision: Union[str, None] = 'n9d1e3f5a8b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backup_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('server_id', sa.String(length=60), nullable=False),
        sa.Column('backup_type', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('sha256', sa.String(length=64), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'received_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_backup_events_server_occurred',
        'backup_events',
        ['server_id', sa.text('occurred_at DESC')],
    )
    op.create_index(
        'ix_backup_events_status_occurred',
        'backup_events',
        ['status', sa.text('occurred_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_backup_events_status_occurred', table_name='backup_events')
    op.drop_index('ix_backup_events_server_occurred', table_name='backup_events')
    op.drop_table('backup_events')
