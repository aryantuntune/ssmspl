"""create project_todos table

Revision ID: p1q3r5t7v9w2
Revises: n9d1e3f5a8b2
Create Date: 2026-05-13 00:00:00.000000

Persistent project-todo list for the SuperAdmin mobile app. Admin/SuperAdmin
only. Status/priority kept as VARCHAR + CHECK (not Postgres ENUM) so adding
a new value later is a one-line ALTER. tags is a Postgres ARRAY indexed
with GIN for fast `tag = ANY(tags)` lookups.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "p1q3r5t7v9w2"
# Chained AFTER the backup_events migration so we end up with a single head.
# Both were generated against the same parent n9d1e3f5a8b2 by parallel
# worktree agents; re-pointing here gives alembic a clean linear chain.
down_revision: Union[str, None] = "p1f4c2a90e6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_todos",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="open",
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.String(length=10),
            server_default="medium",
            nullable=False,
        ),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(length=40)),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('open','in_progress','done','wont_do')",
            name="ck_project_todos_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low','medium','high')",
            name="ck_project_todos_priority",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ON UPDATE now() — Postgres has no native ON UPDATE trigger syntax,
    # so we install a trigger. SQLAlchemy's `onupdate=func.now()` only fires
    # on ORM-mediated UPDATEs; raw SQL / non-ORM UPDATEs would skip it.
    # The trigger guarantees updated_at moves regardless of how the row
    # is touched.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION project_todos_set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_project_todos_set_updated_at
        BEFORE UPDATE ON project_todos
        FOR EACH ROW
        EXECUTE FUNCTION project_todos_set_updated_at();
        """
    )

    # Composite index for the default dashboard ordering / status filter.
    op.create_index(
        "ix_project_todos_status_priority_created_at",
        "project_todos",
        ["status", "priority", "created_at"],
        postgresql_using="btree",
    )
    op.create_index(
        "ix_project_todos_created_by",
        "project_todos",
        ["created_by"],
    )
    # GIN index on tags ARRAY for fast `tag = ANY(tags)` / `@>` lookups.
    op.create_index(
        "ix_project_todos_tags_gin",
        "project_todos",
        ["tags"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_project_todos_tags_gin", table_name="project_todos")
    op.drop_index("ix_project_todos_created_by", table_name="project_todos")
    op.drop_index(
        "ix_project_todos_status_priority_created_at", table_name="project_todos"
    )
    op.execute("DROP TRIGGER IF EXISTS trg_project_todos_set_updated_at ON project_todos;")
    op.execute("DROP FUNCTION IF EXISTS project_todos_set_updated_at();")
    op.drop_table("project_todos")
