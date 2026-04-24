"""add boat_id to ferry_schedules for schedule-based ferry assignment

Revision ID: n9d1e3f5a8b2
Revises: m8c0d2e4f6a9
Create Date: 2026-04-25 00:00:00.000000

Ferries on a route rotate per schedule slot (e.g. on a 2-ferry route, branch A
sees Ferry 1 at 7am and Ferry 2 at 9am, while branch B sees the opposite).
Storing boat_id explicitly per schedule row keeps the rotation editable
(a boat going down for service just needs that row updated). Tickets created
via POST /api/tickets will derive boat_id from the matching schedule row
(same branch_id + same departure time), so operators never pick a ferry.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n9d1e3f5a8b2"
down_revision: Union[str, None] = "m8c0d2e4f6a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ferry_schedules",
        sa.Column("boat_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "ferry_schedules_boat_id_fkey",
        "ferry_schedules", "boats",
        ["boat_id"], ["id"],
    )
    op.create_index(
        "ix_ferry_schedules_boat_id", "ferry_schedules", ["boat_id"]
    )
    # Composite index supports the (branch_id, departure) lookup that
    # ticket creation uses on every booking.
    op.create_index(
        "ix_ferry_schedules_branch_departure",
        "ferry_schedules",
        ["branch_id", "departure"],
    )


def downgrade() -> None:
    op.drop_index("ix_ferry_schedules_branch_departure", table_name="ferry_schedules")
    op.drop_index("ix_ferry_schedules_boat_id", table_name="ferry_schedules")
    op.drop_constraint(
        "ferry_schedules_boat_id_fkey", "ferry_schedules", type_="foreignkey"
    )
    op.drop_column("ferry_schedules", "boat_id")
