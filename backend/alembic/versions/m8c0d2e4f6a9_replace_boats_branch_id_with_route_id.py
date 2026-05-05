"""replace boats.branch_id with boats.route_id

Revision ID: m8c0d2e4f6a9
Revises: k7b9d1e3f5c8
Create Date: 2026-04-24 00:00:00.000000

A ferry runs between two ports (a route corridor), not at a single branch.
The previous boats.branch_id column was added but never used in the ORM model
or any business logic, so dropping it is non-destructive (verified on prod:
0 rows had branch_id populated). Replacing it with route_id matches the
domain model captured in the official Ferry location details PDF (30.03.2026)
where every vessel is registered against a route pair like "VESAV-BAGMANDALE".

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m8c0d2e4f6a9"
down_revision: Union[str, None] = "k7b9d1e3f5c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Drop the auto-named FK constraint Postgres created when branch_id was added
    # inline via ADD COLUMN ... REFERENCES branches(id) (verified in prod schema dump).
    conn.execute(sa.text("ALTER TABLE boats DROP CONSTRAINT IF EXISTS boats_branch_id_fkey"))
    conn.execute(sa.text("ALTER TABLE boats DROP COLUMN IF EXISTS branch_id"))

    # Add route_id; nullable so existing rows survive the migration
    # (data backfill is handled by the seed/UPDATE script, not this migration).
    op.add_column("boats", sa.Column("route_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "boats_route_id_fkey", "boats", "routes", ["route_id"], ["id"]
    )
    op.create_index("ix_boats_route_id", "boats", ["route_id"])


def downgrade() -> None:
    op.drop_index("ix_boats_route_id", table_name="boats")
    op.drop_constraint("boats_route_id_fkey", "boats", type_="foreignkey")
    op.drop_column("boats", "route_id")

    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE boats ADD COLUMN branch_id INTEGER REFERENCES branches(id)"))
