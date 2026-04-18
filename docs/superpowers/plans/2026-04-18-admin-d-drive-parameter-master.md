# Admin D Drive + Parameter Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build D Drive (branch ticket review + CASH adjustment workflow) and Parameter Master (rule management) as admin-only screens on admin.carferry.online, with full audit trail in ssmspl_admin.

**Architecture:** Two-phase (dry-run → commit) adjustment engine. Stored execution plan reused on commit. Advisory locks prevent concurrent adjustments. All new tables are admin-local (ssmspl_admin only — never touches ssmspl_db_prod).

**Tech Stack:** FastAPI async, SQLAlchemy 2.0, asyncpg, PostgreSQL 16, Alembic; Next.js 16, React 19, TypeScript strict, Tailwind CSS v4.

---

## File Map

### New Backend Files
| File | Purpose |
|---|---|
| `backend/app/models/admin_user_access.py` | Per-user portal access toggle |
| `backend/app/models/parameter_master.py` | Adjustment rule definitions |
| `backend/app/models/admin_adjustments_log.py` | One record per adjustment batch |
| `backend/app/models/admin_adjustment_details.py` | Per-item audit of what changed |
| `backend/app/models/tickets_backup.py` | Pre-adjustment snapshot of tickets |
| `backend/app/models/ticket_items_backup.py` | Pre-adjustment snapshot of ticket_items |
| `backend/app/services/admin_user_access_service.py` | Grant/revoke per-user admin access |
| `backend/app/services/admin_parameter_master_service.py` | CRUD for rules, reorder, preview |
| `backend/app/services/admin_d_drive_service.py` | Ticket listing, branch summaries |
| `backend/app/services/admin_adjustment_engine.py` | Two-phase dry-run + commit logic |
| `backend/app/routers/admin_user_access.py` | `/api/admin/user-access` endpoints |
| `backend/app/routers/admin_parameter_master.py` | `/api/admin/parameter-master` endpoints |
| `backend/app/routers/admin_d_drive.py` | `/api/admin/d-drive` endpoints |

### Modified Backend Files
| File | Change |
|---|---|
| `backend/app/models/__init__.py` | Import all 6 new models |
| `backend/app/models/ticket.py` | Add `last_adjustment_id` to `TicketItem` |
| `backend/app/core/rbac.py` | Add "D Drive", "Parameter Master" to SUPER_ADMIN + ADMIN menus |
| `backend/app/services/admin_screen_service.py` | Add to TOGGLEABLE_SCREENS |
| `backend/app/dependencies.py` | Admin-portal user access check |
| `backend/app/main.py` | Register 3 new admin routers conditionally |

### New Frontend Files
| File | Purpose |
|---|---|
| `frontend/src/app/dashboard/d-drive/page.tsx` | D Drive main page |
| `frontend/src/app/dashboard/d-drive/components/FilterBar.tsx` | Date/branch/item/mode filters |
| `frontend/src/app/dashboard/d-drive/components/BranchSummaryCards.tsx` | Per-branch cash/upi/online cards |
| `frontend/src/app/dashboard/d-drive/components/TicketTable.tsx` | Paginated ticket list |
| `frontend/src/app/dashboard/d-drive/components/AdjustmentModal.tsx` | Amount entry + dry-run trigger |
| `frontend/src/app/dashboard/d-drive/components/DryRunPreview.tsx` | Before/after summary + confirm |
| `frontend/src/app/dashboard/parameter-master/page.tsx` | Parameter Master main page |
| `frontend/src/app/dashboard/parameter-master/components/RuleTable.tsx` | Priority-ordered rule list |
| `frontend/src/app/dashboard/parameter-master/components/RuleModal.tsx` | Create/edit rule form |
| `frontend/src/app/dashboard/parameter-master/components/PreviewModal.tsx` | Matching ticket preview per rule |
| `frontend/src/app/dashboard/settings/components/user-access-tab.tsx` | Per-user toggle for SUPER_ADMIN |

### Modified Frontend Files
| File | Change |
|---|---|
| `frontend/src/components/dashboard/sidebar-menu-config.ts` | Add D Drive + Parameter Master entries |
| `frontend/src/app/dashboard/settings/page.tsx` | Add User Access tab |

---

## Task 1: New SQLAlchemy Models

**Files:** Create all 6 new model files + modify `ticket.py`

- [ ] **Step 1: Create `backend/app/models/admin_user_access.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AdminUserAccess(Base):
    __tablename__ = "admin_user_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    is_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_super_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    granted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<AdminUserAccess user_id={self.user_id} is_granted={self.is_granted}>"
```

- [ ] **Step 2: Create `backend/app/models/parameter_master.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ParameterMaster(Base):
    __tablename__ = "parameter_master"
    __table_args__ = (
        CheckConstraint(
            "ticket_selection_order IN ('FIFO','LIFO','HIGHEST_VALUE','LOWEST_VALUE')",
            name="ck_pm_selection_order",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    priority_order: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    branch_scope: Mapped[int | None] = mapped_column(Integer, ForeignKey("branches.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("items.id"), nullable=True)
    payment_mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="CASH")
    ticket_conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    item_conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    ticket_selection_order: Mapped[str] = mapped_column(String(20), nullable=False, server_default="FIFO")
    max_adjustment_per_ticket: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    max_adjustment_per_item: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    max_total_adjustment_per_rule: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    stop_on_match: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    def __repr__(self) -> str:
        return f"<ParameterMaster priority={self.priority_order} active={self.is_active}>"
```

- [ ] **Step 3: Create `backend/app/models/admin_adjustments_log.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AdminAdjustmentsLog(Base):
    __tablename__ = "admin_adjustments_log"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED')",
            name="ck_adj_log_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    date_range_start: Mapped[object] = mapped_column(Date, nullable=False)
    date_range_end: Mapped[object] = mapped_column(Date, nullable=False)
    adjustment_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    dry_run_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    total_tickets_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_items_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    row_count_checked: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="DRY_RUN")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<AdminAdjustmentsLog id={self.id} status={self.status}>"
```

- [ ] **Step 4: Create `backend/app/models/admin_adjustment_details.py`**

```python
import uuid
from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AdminAdjustmentDetails(Base):
    __tablename__ = "admin_adjustment_details"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ticket_item_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    old_rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    old_levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    new_rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    new_levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    rate_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    levy_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    total_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    matched_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("parameter_master.id"), nullable=True)
```

- [ ] **Step 5: Create `backend/app/models/tickets_backup.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TicketsBackup(Base):
    __tablename__ = "tickets_backup"
    __table_args__ = (
        Index("ix_tickets_backup_batch_ticket", "adjustment_batch_id", "ticket_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    original_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    backed_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [ ] **Step 6: Create `backend/app/models/ticket_items_backup.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TicketItemsBackup(Base):
    __tablename__ = "ticket_items_backup"
    __table_args__ = (
        Index("ix_ticket_items_backup_batch_item", "adjustment_batch_id", "ticket_item_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_item_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    original_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    backed_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [ ] **Step 7: Add `last_adjustment_id` to TicketItem in `backend/app/models/ticket.py`**

Add this import at the top of the existing imports:
```python
import uuid as uuid_mod
```
(already present)

Add this column to the `TicketItem` class after the `quantity` column:
```python
    last_adjustment_id: Mapped[uuid_mod.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=True
    )
```

- [ ] **Step 8: Commit models**

```bash
cd backend
git add app/models/admin_user_access.py app/models/parameter_master.py app/models/admin_adjustments_log.py app/models/admin_adjustment_details.py app/models/tickets_backup.py app/models/ticket_items_backup.py app/models/ticket.py
git commit -m "feat: add D Drive + Parameter Master SQLAlchemy models"
```

---

## Task 2: Register Models + Run Migration

**Files:** `backend/app/models/__init__.py`, run alembic

- [ ] **Step 1: Update `backend/app/models/__init__.py`** — add after the `AdminScreenToggle` import line:

```python
from app.models.admin_user_access import AdminUserAccess
from app.models.parameter_master import ParameterMaster
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup
```

And add to `__all__`:
```python
    "AdminUserAccess",
    "ParameterMaster",
    "AdminAdjustmentsLog",
    "AdminAdjustmentDetails",
    "TicketsBackup",
    "TicketItemsBackup",
```

- [ ] **Step 2: Generate migration**

```bash
cd backend
.venv/Scripts/activate
alembic revision --autogenerate -m "add_d_drive_and_parameter_master_tables"
```

Expected: new file created in `alembic/versions/` with `add_` prefix. Open the file and verify it contains `op.create_table` calls for all 6 new tables and `op.add_column` for `ticket_items.last_adjustment_id`. Verify FK for `last_adjustment_id` comes after `admin_adjustments_log` table creation.

- [ ] **Step 3: Run migration against ssmspl_admin**

```bash
alembic upgrade head
```

Expected output: `Running upgrade ... -> <hash>, add_d_drive_and_parameter_master_tables`

- [ ] **Step 4: Verify tables exist**

```bash
python -c "
import asyncio
from app.database import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        r = await conn.execute(text(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('admin_user_access','parameter_master','admin_adjustments_log','admin_adjustment_details','tickets_backup','ticket_items_backup')\"))
        print([row[0] for row in r.all()])
asyncio.run(check())
"
```

Expected: all 6 table names printed.

- [ ] **Step 5: Commit**

```bash
git add app/models/__init__.py alembic/versions/
git commit -m "feat: register admin models and run migration"
```

---

## Task 3: RBAC + Screen Toggle Updates

**Files:** `backend/app/core/rbac.py`, `backend/app/services/admin_screen_service.py`, `frontend/src/components/dashboard/sidebar-menu-config.ts`

- [ ] **Step 1: Update `backend/app/core/rbac.py`** — add `"D Drive"` and `"Parameter Master"` to both `SUPER_ADMIN` and `ADMIN` lists, after `"User Sessions"` / before `"System Settings"` respectively:

```python
    UserRole.SUPER_ADMIN: [
        "Dashboard",
        "D Drive",
        "Parameter Master",
        "Users",
        "Ferries",
        "Branches",
        "Routes",
        "Schedules",
        "Items",
        "Item Rates",
        "Payment Modes",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
        "Rate Change Logs",
        "Employee Transfer",
        "Ticket Verification",
        "System Settings",
        "User Sessions",
    ],
    UserRole.ADMIN: [
        "Dashboard",
        "D Drive",
        "Parameter Master",
        "Users",
        "Ferries",
        "Branches",
        "Routes",
        "Schedules",
        "Items",
        "Item Rates",
        "Payment Modes",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
        "Rate Change Logs",
        "Employee Transfer",
        "Ticket Verification",
        "System Settings",
    ],
```

- [ ] **Step 2: Update `backend/app/services/admin_screen_service.py`** — add to `TOGGLEABLE_SCREENS` list:

```python
TOGGLEABLE_SCREENS: list[str] = [
    "D Drive",
    "Parameter Master",
    "Users",
    "Ferries",
    # ... rest unchanged
]
```

Place `"D Drive"` and `"Parameter Master"` at the top of the list.

- [ ] **Step 3: Update `frontend/src/components/dashboard/sidebar-menu-config.ts`**

Add these imports:
```typescript
import { Database, SlidersHorizontal } from "lucide-react";
```

Add a new section before the `Masters` group:
```typescript
  {
    sectionLabel: "RECONCILIATION",
    entries: [
      { label: "D Drive", icon: Database, href: "/dashboard/d-drive" },
      { label: "Parameter Master", icon: SlidersHorizontal, href: "/dashboard/parameter-master" },
    ],
  },
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/rbac.py backend/app/services/admin_screen_service.py frontend/src/components/dashboard/sidebar-menu-config.ts
git commit -m "feat: add D Drive and Parameter Master to RBAC and sidebar"
```

---

## Task 4: Admin User Access Service + Router + Auth Guard

**Files:** `backend/app/services/admin_user_access_service.py`, `backend/app/routers/admin_user_access.py`, `backend/app/dependencies.py`, `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/services/admin_user_access_service.py`**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_user_access import AdminUserAccess
from app.models.user import User
from app.core.rbac import UserRole


async def list_admin_users_with_access(db: AsyncSession) -> list[dict]:
    """Return all ADMIN users with their current portal access status."""
    result = await db.execute(
        select(User, AdminUserAccess)
        .outerjoin(AdminUserAccess, AdminUserAccess.user_id == User.id)
        .where(User.role == UserRole.ADMIN, User.is_active == True)
        .order_by(User.full_name)
    )
    rows = result.all()
    return [
        {
            "user_id": str(row.User.id),
            "full_name": row.User.full_name,
            "username": row.User.username,
            "is_granted": row.AdminUserAccess.is_granted if row.AdminUserAccess else False,
            "granted_at": row.AdminUserAccess.granted_at if row.AdminUserAccess else None,
        }
        for row in rows
    ]


async def set_user_access(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    is_granted: bool,
    granted_by: uuid.UUID,
) -> dict:
    """Grant or revoke portal access for a specific ADMIN user."""
    result = await db.execute(
        select(AdminUserAccess).where(AdminUserAccess.user_id == target_user_id)
    )
    access = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if access is None:
        access = AdminUserAccess(
            user_id=target_user_id,
            is_granted=is_granted,
            granted_by=granted_by if is_granted else None,
            granted_at=now if is_granted else None,
        )
        db.add(access)
    else:
        access.is_granted = is_granted
        access.granted_by = granted_by if is_granted else None
        access.granted_at = now if is_granted else None
        access.updated_at = now

    await db.flush()
    return {
        "user_id": str(target_user_id),
        "is_granted": access.is_granted,
        "granted_at": access.granted_at,
    }


async def check_user_access(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Return True if this user has been granted admin portal access."""
    result = await db.execute(
        select(AdminUserAccess.is_granted).where(AdminUserAccess.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    return bool(row)
```

- [ ] **Step 2: Create `backend/app/routers/admin_user_access.py`**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_user_access_service

router = APIRouter(prefix="/api/admin/user-access", tags=["Admin User Access"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


class AccessToggle(BaseModel):
    is_granted: bool


@router.get("", summary="List ADMIN users with access status")
async def list_access(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_user_access_service.list_admin_users_with_access(db)


@router.put("/{user_id}", summary="Grant or revoke admin portal access")
async def update_access(
    user_id: uuid.UUID,
    body: AccessToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_user_access_service.set_user_access(
        db, user_id, body.is_granted, current_user.id
    )
```

- [ ] **Step 3: Update `backend/app/dependencies.py`** — add admin portal access check inside `get_current_user`, after the idle timeout block and before `return user`:

```python
    # Admin portal: ADMIN users must be explicitly granted access
    if settings.ADMIN_PORTAL_MODE and user.role == UserRole.ADMIN:
        if not hasattr(request.state, "admin_access_checked"):
            from app.services.admin_user_access_service import check_user_access
            granted = await check_user_access(db, user.id)
            request.state.admin_access_checked = granted
        if not request.state.admin_access_checked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin portal access not granted. Contact your system administrator.",
            )
```

- [ ] **Step 4: Register router in `backend/app/main.py`** — in the admin-portal-only block:

```python
# Admin-only routers — only active when ADMIN_PORTAL_MODE=true
if settings.ADMIN_PORTAL_MODE:
    from app.routers import admin_user_access, admin_parameter_master, admin_d_drive
    app.include_router(admin_user_access.router)
    app.include_router(admin_parameter_master.router)
    app.include_router(admin_d_drive.router)
```

Add this block after line 258 (after `app.include_router(user_sessions.router)`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/admin_user_access_service.py backend/app/routers/admin_user_access.py backend/app/dependencies.py backend/app/main.py
git commit -m "feat: add admin user access control service and router"
```

---

## Task 5: Parameter Master Service + Router

**Files:** `backend/app/services/admin_parameter_master_service.py`, `backend/app/routers/admin_parameter_master.py`

- [ ] **Step 1: Create `backend/app/services/admin_parameter_master_service.py`**

```python
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.parameter_master import ParameterMaster
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode


async def list_rules(db: AsyncSession) -> list[ParameterMaster]:
    result = await db.execute(
        select(ParameterMaster).order_by(ParameterMaster.priority_order)
    )
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, rule_id: int) -> ParameterMaster | None:
    result = await db.execute(
        select(ParameterMaster).where(ParameterMaster.id == rule_id)
    )
    return result.scalar_one_or_none()


async def create_rule(db: AsyncSession, data: dict, created_by: uuid.UUID) -> ParameterMaster:
    # Shift existing rules to make room if priority_order collides
    await _make_priority_room(db, data["priority_order"])
    rule = ParameterMaster(**data, created_by=created_by)
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, rule_id: int, data: dict) -> ParameterMaster:
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return None
    if "priority_order" in data and data["priority_order"] != rule.priority_order:
        await _make_priority_room(db, data["priority_order"], exclude_id=rule_id)
    for k, v in data.items():
        setattr(rule, k, v)
    await db.flush()
    await db.refresh(rule)
    return rule


async def set_rule_status(db: AsyncSession, rule_id: int, is_active: bool) -> ParameterMaster | None:
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return None
    rule.is_active = is_active
    await db.flush()
    return rule


async def reorder_rules(db: AsyncSession, ordered_ids: list[int]) -> list[ParameterMaster]:
    """Assign new priority_order values based on the supplied list order."""
    result = await db.execute(
        select(ParameterMaster).where(ParameterMaster.id.in_(ordered_ids))
    )
    rules = {r.id: r for r in result.scalars().all()}
    for idx, rule_id in enumerate(ordered_ids, start=1):
        if rule_id in rules:
            rules[rule_id].priority_order = idx
    await db.flush()
    return sorted(rules.values(), key=lambda r: r.priority_order)


async def preview_rule_matches(
    db: AsyncSession,
    rule_id: int,
    branch_id: int | None,
    date_start: str,
    date_end: str,
) -> dict:
    """Count tickets/items/cash that would match this rule for given filters."""
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return {"error": "Rule not found"}

    effective_branch = rule.branch_scope or branch_id

    q = (
        select(
            func.count(Ticket.id.distinct()).label("ticket_count"),
            func.count(TicketItem.id).label("item_count"),
            func.sum(Ticket.net_amount.distinct()).label("cash_total"),
        )
        .select_from(Ticket)
        .join(TicketItem, TicketItem.ticket_id == Ticket.id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    if effective_branch:
        q = q.where(Ticket.branch_id == effective_branch)
    if rule.item_id:
        q = q.where(TicketItem.item_id == rule.item_id)

    row = (await db.execute(q)).one()
    return {
        "eligible_tickets": row.ticket_count or 0,
        "eligible_items": row.item_count or 0,
        "cash_total": float(row.cash_total or 0),
    }


async def _make_priority_room(db: AsyncSession, priority: int, exclude_id: int | None = None) -> None:
    """Shift rules with priority >= the target up by 1 to make room."""
    q = select(ParameterMaster).where(ParameterMaster.priority_order >= priority)
    if exclude_id is not None:
        q = q.where(ParameterMaster.id != exclude_id)
    result = await db.execute(q)
    for rule in result.scalars().all():
        rule.priority_order += 1
    await db.flush()
```

- [ ] **Step 2: Create `backend/app/routers/admin_parameter_master.py`**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_parameter_master_service

router = APIRouter(prefix="/api/admin/parameter-master", tags=["Admin Parameter Master"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)
_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


class RuleOut(BaseModel):
    id: int
    priority_order: int
    branch_scope: int | None
    item_id: int | None
    payment_mode: str
    ticket_conditions: dict
    item_conditions: dict
    ticket_selection_order: str
    max_adjustment_per_ticket: float | None
    max_adjustment_per_item: float | None
    max_total_adjustment_per_rule: float | None
    stop_on_match: bool
    is_active: bool
    model_config = {"from_attributes": True}


class RuleCreate(BaseModel):
    priority_order: int
    branch_scope: int | None = None
    item_id: int | None = None
    payment_mode: str = "CASH"
    ticket_conditions: dict = {}
    item_conditions: dict = {}
    ticket_selection_order: str = "FIFO"
    max_adjustment_per_ticket: float | None = None
    max_adjustment_per_item: float | None = None
    max_total_adjustment_per_rule: float | None = None
    stop_on_match: bool = False


class ReorderBody(BaseModel):
    ordered_ids: list[int]


class StatusToggle(BaseModel):
    is_active: bool


class PreviewQuery(BaseModel):
    branch_id: int | None = None
    date_start: str
    date_end: str


@router.get("", response_model=list[RuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_parameter_master_service.list_rules(db)


@router.post("", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_parameter_master_service.create_rule(db, body.model_dump(), current_user.id)


@router.put("/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    rule = await admin_parameter_master_service.update_rule(db, rule_id, body.model_dump())
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/{rule_id}/status", response_model=RuleOut)
async def toggle_rule_status(
    rule_id: int,
    body: StatusToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    rule = await admin_parameter_master_service.set_rule_status(db, rule_id, body.is_active)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/reorder", response_model=list[RuleOut])
async def reorder_rules(
    body: ReorderBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_parameter_master_service.reorder_rules(db, body.ordered_ids)


@router.post("/{rule_id}/preview")
async def preview_rule(
    rule_id: int,
    body: PreviewQuery,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_parameter_master_service.preview_rule_matches(
        db, rule_id, body.branch_id, body.date_start, body.date_end
    )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/admin_parameter_master_service.py backend/app/routers/admin_parameter_master.py
git commit -m "feat: add parameter master service and router"
```

---

## Task 6: D Drive Service

**File:** `backend/app/services/admin_d_drive_service.py`

- [ ] **Step 1: Create `backend/app/services/admin_d_drive_service.py`**

```python
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.ticket import Ticket, TicketItem
from app.models.branch import Branch
from app.models.payment_mode import PaymentMode
from app.models.user import User
from app.models.item import Item


async def get_branch_summary(
    db: AsyncSession,
    date_start: date,
    date_end: date,
    branch_id: int | None = None,
    payment_mode_name: str | None = None,
    item_id: int | None = None,
) -> list[dict]:
    """Aggregate collection by branch, broken down by payment mode."""
    q = (
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            PaymentMode.name.label("payment_mode"),
            func.count(Ticket.id.distinct()).label("ticket_count"),
            func.sum(Ticket.net_amount).label("total"),
        )
        .select_from(Ticket)
        .join(Branch, Branch.id == Ticket.branch_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
        )
    )
    if branch_id:
        q = q.where(Ticket.branch_id == branch_id)
    if payment_mode_name:
        q = q.where(PaymentMode.name == payment_mode_name)
    if item_id:
        # Use EXISTS to avoid join-inflated sums (a ticket with 2 matching items
        # would have its net_amount counted twice with a plain JOIN)
        item_exists = (
            select(TicketItem.id)
            .where(
                TicketItem.ticket_id == Ticket.id,
                TicketItem.item_id == item_id,
                TicketItem.is_cancelled == False,
            )
            .exists()
        )
        q = q.where(item_exists)
    q = q.group_by(Branch.id, Branch.name, PaymentMode.name).order_by(Branch.name)

    rows = (await db.execute(q)).all()

    # Pivot by branch
    branches: dict[int, dict] = {}
    for row in rows:
        bid = row.branch_id
        if bid not in branches:
            branches[bid] = {
                "branch_id": bid,
                "branch_name": row.branch_name,
                "ticket_count": 0,
                "total": 0.0,
                "cash": 0.0,
                "upi": 0.0,
                "online": 0.0,
            }
        branches[bid]["total"] += float(row.total or 0)
        branches[bid]["ticket_count"] += row.ticket_count or 0
        mode = (row.payment_mode or "").upper()
        if mode == "CASH":
            branches[bid]["cash"] += float(row.total or 0)
        elif mode == "UPI":
            branches[bid]["upi"] += float(row.total or 0)
        else:
            branches[bid]["online"] += float(row.total or 0)

    return list(branches.values())


async def list_tickets(
    db: AsyncSession,
    date_start: date,
    date_end: date,
    branch_id: int | None = None,
    payment_mode_name: str | None = None,
    item_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Paginated ticket list with optional filters."""
    base = (
        select(
            Ticket.id,
            Ticket.ticket_date,
            Ticket.net_amount,
            Branch.name.label("branch_name"),
            PaymentMode.name.label("payment_mode"),
            User.full_name.label("operator_name"),
        )
        .select_from(Ticket)
        .join(Branch, Branch.id == Ticket.branch_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .outerjoin(User, User.id == Ticket.created_by)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
        )
    )
    if branch_id:
        base = base.where(Ticket.branch_id == branch_id)
    if payment_mode_name:
        base = base.where(PaymentMode.name == payment_mode_name)
    if item_id:
        # Use EXISTS — plain JOIN duplicates rows when a ticket has multiple matching items
        item_exists = (
            select(TicketItem.id)
            .where(
                TicketItem.ticket_id == Ticket.id,
                TicketItem.item_id == item_id,
                TicketItem.is_cancelled == False,
            )
            .exists()
        )
        base = base.where(item_exists)

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Ticket.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    # Item summary per ticket (brief)
    ticket_ids = [r.id for r in rows]
    items_q = (
        select(TicketItem.ticket_id, Item.name, TicketItem.quantity)
        .join(Item, Item.id == TicketItem.item_id)
        .where(TicketItem.ticket_id.in_(ticket_ids), TicketItem.is_cancelled == False)
    )
    item_rows = (await db.execute(items_q)).all()
    items_by_ticket: dict[int, list[str]] = {}
    for ir in item_rows:
        items_by_ticket.setdefault(ir.ticket_id, []).append(f"{ir.quantity}x {ir.name}")

    tickets = [
        {
            "id": r.id,
            "ticket_date": r.ticket_date.isoformat() if r.ticket_date else None,
            "branch_name": r.branch_name,
            "payment_mode": r.payment_mode,
            "net_amount": float(r.net_amount),
            "operator_name": r.operator_name,
            "item_summary": ", ".join(items_by_ticket.get(r.id, [])),
        }
        for r in rows
    ]

    return {
        "tickets": tickets,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/admin_d_drive_service.py
git commit -m "feat: add D Drive query service"
```

---

## Task 7: Adjustment Engine

**File:** `backend/app/services/admin_adjustment_engine.py`

- [ ] **Step 1: Create `backend/app/services/admin_adjustment_engine.py`** with dry_run and commit:

```python
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_DOWN
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.parameter_master import ParameterMaster
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup

MAX_ITEM_ROWS = 5000
PREVIEW_TICKET_CAP = 50


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


async def _count_eligible_items(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date
) -> int:
    q = (
        select(func.count(TicketItem.id))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    return (await db.execute(q)).scalar_one()


async def _fetch_cash_total(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date
) -> Decimal:
    q = (
        select(func.coalesce(func.sum(Ticket.net_amount), 0))
        .select_from(Ticket)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    return Decimal(str((await db.execute(q)).scalar_one()))


def _order_clause(rule: ParameterMaster):
    order = rule.ticket_selection_order
    if order == "LIFO":
        return [Ticket.id.desc(), TicketItem.id.asc()]
    if order == "HIGHEST_VALUE":
        return [((TicketItem.rate + TicketItem.levy) * TicketItem.quantity).desc(), Ticket.id.asc(), TicketItem.id.asc()]
    if order == "LOWEST_VALUE":
        return [((TicketItem.rate + TicketItem.levy) * TicketItem.quantity).asc(), Ticket.id.asc(), TicketItem.id.asc()]
    return [Ticket.id.asc(), TicketItem.id.asc()]  # FIFO default


async def _fetch_eligible_items_for_rule(
    db: AsyncSession,
    rule: ParameterMaster,
    branch_id: int,
    date_start: date,
    date_end: date,
) -> list[dict]:
    q = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.net_amount.label("ticket_net_amount"),
            TicketItem.id.label("item_id"),
            TicketItem.rate,
            TicketItem.levy,
            TicketItem.quantity,
        )
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
        .order_by(*_order_clause(rule))
    )
    if rule.item_id:
        q = q.where(TicketItem.item_id == rule.item_id)

    rows = (await db.execute(q)).all()
    return [
        {
            "ticket_id": r.ticket_id,
            "ticket_net_amount": Decimal(str(r.ticket_net_amount)),
            "item_id": r.item_id,
            "rate": Decimal(str(r.rate)),
            "levy": Decimal(str(r.levy)),
            "quantity": r.quantity,
        }
        for r in rows
    ]


def _apply_rule_to_items(
    items: list[dict],
    remaining: Decimal,
    rule: ParameterMaster,
) -> tuple[list[dict], Decimal]:
    """
    Apply adjustment to items for one rule. Returns list of change records and
    the remaining amount after this rule. Stops strictly when remaining == 0.
    Pro-rates delta by item value within the rule's total eligible value.
    """
    if remaining <= 0:
        return [], remaining

    max_per_rule = Decimal(str(rule.max_total_adjustment_per_rule)) if rule.max_total_adjustment_per_rule else None
    max_per_item = Decimal(str(rule.max_adjustment_per_item)) if rule.max_adjustment_per_item else None
    max_per_ticket = Decimal(str(rule.max_adjustment_per_ticket)) if rule.max_adjustment_per_ticket else None

    rule_cap = min(remaining, max_per_rule) if max_per_rule else remaining
    if rule_cap <= 0:
        return [], remaining

    # Total eligible value for this rule (for pro-ration)
    total_eligible = sum(
        (item["rate"] + item["levy"]) * item["quantity"] for item in items
    )
    if total_eligible <= 0:
        return [], remaining

    changes = []
    rule_spent = Decimal("0")
    ticket_spent: dict[int, Decimal] = {}

    for item in items:
        if rule_spent >= rule_cap or remaining <= 0:
            break

        item_value = (item["rate"] + item["levy"]) * item["quantity"]
        # Pro-rate share of this item in the rule's cap
        pro_rata = (item_value / total_eligible * rule_cap).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        # Apply per-item cap
        delta = pro_rata
        if max_per_item:
            delta = min(delta, max_per_item)
        # Apply per-ticket cap
        if max_per_ticket:
            tid = item["ticket_id"]
            ticket_spent.setdefault(tid, Decimal("0"))
            ticket_remaining = max_per_ticket - ticket_spent[tid]
            delta = min(delta, ticket_remaining)
        # Cannot exceed remaining
        delta = min(delta, remaining - rule_spent, rule_cap - rule_spent)
        delta = delta.quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        if delta <= 0:
            continue

        # Apply delta to rate first, then levy
        rate_delta = min(delta, item["rate"] * item["quantity"])
        levy_delta = delta - rate_delta
        new_rate = (item["rate"] - rate_delta / item["quantity"]).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
        new_levy = (item["levy"] - levy_delta / item["quantity"]).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        changes.append({
            "ticket_id": item["ticket_id"],
            "item_id": item["item_id"],
            "old_rate": float(item["rate"]),
            "old_levy": float(item["levy"]),
            "new_rate": float(new_rate),
            "new_levy": float(new_levy),
            "rate_delta": float(rate_delta),
            "levy_delta": float(levy_delta),
            "total_delta": float(delta),
        })
        rule_spent += delta
        ticket_spent[item["ticket_id"]] = ticket_spent.get(item["ticket_id"], Decimal("0")) + delta

    remaining -= rule_spent
    return changes, remaining


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    """
    Phase 1: compute and store the execution plan. No data modified.
    Returns a summary + stores the plan in admin_adjustments_log.
    """
    amount = Decimal(str(adjustment_amount)).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Adjustment amount must be positive")

    # Guard 1: row count before loading dataset
    item_count = await _count_eligible_items(db, branch_id, date_start, date_end)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}",
        )

    # Guard 2: adjustment must not exceed eligible cash
    cash_total = await _fetch_cash_total(db, branch_id, date_start, date_end)
    if amount > cash_total:
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment amount (₹{amount}) exceeds eligible cash total (₹{cash_total})",
        )

    # Load active rules in priority order
    rules_result = await db.execute(
        select(ParameterMaster)
        .where(ParameterMaster.is_active == True)
        .order_by(ParameterMaster.priority_order)
    )
    rules = list(rules_result.scalars().all())

    remaining = amount
    all_changes: list[dict] = []
    tickets_affected: set[int] = set()

    for rule in rules:
        if remaining <= 0:
            break
        items = await _fetch_eligible_items_for_rule(db, rule, branch_id, date_start, date_end)
        changes, remaining = _apply_rule_to_items(items, remaining, rule)
        for c in changes:
            c["matched_rule_id"] = rule.id
        all_changes.extend(changes)
        tickets_affected.update(c["ticket_id"] for c in changes)
        if rule.stop_on_match and changes:
            break

    # Build execution plan (deterministic — stored for commit reuse)
    execution_plan = {
        "branch_id": branch_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "adjustment_amount": str(amount),
        "changes": all_changes,
        "cash_total_before": str(cash_total),
        "total_delta": str(sum(Decimal(str(c["total_delta"])) for c in all_changes)),
    }

    before_total = float(cash_total)
    total_applied = float(sum(Decimal(str(c["total_delta"])) for c in all_changes))

    # Store DRY_RUN log entry
    log = AdminAdjustmentsLog(
        branch_id=branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(amount),
        dry_run_summary=execution_plan,
        total_tickets_affected=len(tickets_affected),
        total_items_affected=len(all_changes),
        row_count_checked=item_count,
        status="DRY_RUN",
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "summary": {
            "branch_id": branch_id,
            "date_start": str(date_start),
            "date_end": str(date_end),
            "eligible_items_checked": item_count,
            "cash_total_before": before_total,
            "total_adjustment_applied": total_applied,
            "cash_total_after": before_total - total_applied,
            "tickets_affected": len(tickets_affected),
            "items_affected": len(all_changes),
            "amount_not_applied": float(remaining),
        },
        "preview_changes": all_changes[:PREVIEW_TICKET_CAP],
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    confirmed_by: uuid.UUID,
) -> dict:
    """
    Phase 2: execute the stored plan atomically.
    Reuses dry_run_summary — does NOT recompute.
    """
    # Load the log entry
    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status != "DRY_RUN":
        raise HTTPException(status_code=400, detail=f"Batch is not in DRY_RUN state (current: {log.status})")

    plan = log.dry_run_summary
    changes: list[dict] = plan["changes"]
    branch_id = log.branch_id

    if not changes:
        raise HTTPException(status_code=400, detail="No changes in execution plan")

    # Mark IN_PROGRESS in a separate transaction so log survives rollback
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(AdminAdjustmentsLog.id == batch_id)
                .values(status="IN_PROGRESS")
            )

    try:
        # Advisory lock: prevent concurrent commits for same branch+dates
        date_hash = _date_lock_hash(log.date_range_start, log.date_range_end)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": branch_id, "b": date_hash},
        )

        ticket_ids = list({c["ticket_id"] for c in changes})
        item_ids = [c["item_id"] for c in changes]

        # Backup tickets
        tickets_result = await db.execute(
            select(Ticket).where(Ticket.id.in_(ticket_ids))
        )
        for ticket in tickets_result.scalars().all():
            db.add(TicketsBackup(
                adjustment_batch_id=log.id,
                ticket_id=ticket.id,
                original_data={
                    "id": ticket.id,
                    "net_amount": str(ticket.net_amount),
                    "amount": str(ticket.amount),
                    "discount": str(ticket.discount) if ticket.discount else None,
                    "branch_id": ticket.branch_id,
                    "ticket_date": str(ticket.ticket_date),
                },
            ))

        # Backup ticket_items
        items_result = await db.execute(
            select(TicketItem).where(TicketItem.id.in_(item_ids))
        )
        for ti in items_result.scalars().all():
            db.add(TicketItemsBackup(
                adjustment_batch_id=log.id,
                ticket_item_id=ti.id,
                ticket_id=ti.ticket_id,
                original_data={
                    "id": ti.id,
                    "ticket_id": ti.ticket_id,
                    "item_id": ti.item_id,
                    "rate": str(ti.rate),
                    "levy": str(ti.levy),
                    "quantity": ti.quantity,
                },
            ))

        # Apply changes to ticket_items
        for change in changes:
            await db.execute(
                update(TicketItem)
                .where(TicketItem.id == change["item_id"])
                .values(
                    rate=change["new_rate"],
                    levy=change["new_levy"],
                    last_adjustment_id=log.id,
                )
            )

        # Recalculate net_amount for affected tickets only
        await db.execute(
            text("""
                UPDATE tickets
                SET net_amount = (
                    SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                    FROM ticket_items ti
                    WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                )
                WHERE id = ANY(:ids)
            """),
            {"ids": ticket_ids},
        )

        # Insert audit details
        for change in changes:
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=change["ticket_id"],
                ticket_item_id=change["item_id"],
                old_rate=change["old_rate"],
                old_levy=change["old_levy"],
                new_rate=change["new_rate"],
                new_levy=change["new_levy"],
                rate_delta=change["rate_delta"],
                levy_delta=change["levy_delta"],
                total_delta=change["total_delta"],
                matched_rule_id=change.get("matched_rule_id"),
            ))

        # Mark COMMITTED
        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(changes)
        await db.flush()

    except Exception as exc:
        # Mark FAILED in separate session
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(AdminAdjustmentsLog.id == batch_id)
                    .values(status="FAILED", error_message=str(exc)[:2000])
                )
        raise

    return {
        "batch_id": str(log.id),
        "status": "COMMITTED",
        "tickets_affected": len(ticket_ids),
        "items_affected": len(changes),
        "executed_at": log.executed_at.isoformat(),
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/admin_adjustment_engine.py
git commit -m "feat: add two-phase adjustment engine (dry-run + commit)"
```

---

## Task 8: D Drive Router

**File:** `backend/app/routers/admin_d_drive.py`

- [ ] **Step 1: Create `backend/app/routers/admin_d_drive.py`**

```python
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_d_drive_service, admin_adjustment_engine

router = APIRouter(prefix="/api/admin/d-drive", tags=["Admin D Drive"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("/summary")
async def branch_summary(
    date_start: date = Query(...),
    date_end: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode: str | None = Query(None),
    item_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_d_drive_service.get_branch_summary(
        db, date_start, date_end, branch_id, payment_mode, item_id
    )


@router.get("/tickets")
async def list_tickets(
    date_start: date = Query(...),
    date_end: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode: str | None = Query(None),
    item_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_d_drive_service.list_tickets(
        db, date_start, date_end, branch_id, payment_mode, item_id, page, page_size
    )


class DryRunRequest(BaseModel):
    branch_id: int
    date_start: date
    date_end: date
    adjustment_amount: float


class CommitRequest(BaseModel):
    batch_id: str


@router.post("/adjustment/dry-run")
async def adjustment_dry_run(
    body: DryRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_adjustment_engine.dry_run(
        db,
        branch_id=body.branch_id,
        date_start=body.date_start,
        date_end=body.date_end,
        adjustment_amount=body.adjustment_amount,
        created_by=current_user.id,
    )


@router.post("/adjustment/commit")
async def adjustment_commit(
    body: CommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_adjustment_engine.commit(db, body.batch_id, current_user.id)


@router.get("/adjustment/{batch_id}")
async def get_adjustment(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    from sqlalchemy import select
    from app.models.admin_adjustments_log import AdminAdjustmentsLog
    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    return {
        "id": str(log.id),
        "branch_id": log.branch_id,
        "date_start": str(log.date_range_start),
        "date_end": str(log.date_range_end),
        "adjustment_amount": float(log.adjustment_amount),
        "status": log.status,
        "total_tickets_affected": log.total_tickets_affected,
        "total_items_affected": log.total_items_affected,
        "executed_at": log.executed_at.isoformat() if log.executed_at else None,
        "error_message": log.error_message,
        "summary": log.dry_run_summary,
    }
```

- [ ] **Step 2: Verify backend starts clean**

```bash
cd backend
uvicorn app.main:app --reload
```

Expected: server starts with no import errors. Check `/docs` if `DEBUG=true`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/admin_d_drive.py
git commit -m "feat: add D Drive router with adjustment endpoints"
```

---

## Task 9: Frontend Sidebar + D Drive Page

**Files:** `sidebar-menu-config.ts` (already updated in Task 3), `d-drive/page.tsx`, `d-drive/components/*.tsx`

- [ ] **Step 1: Create `frontend/src/app/dashboard/d-drive/components/FilterBar.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface Filters {
  dateStart: string;
  dateEnd: string;
  branchId: string;
  paymentMode: string;
  itemId: string;
}

interface Props {
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
  onApply: (f: Filters) => void;
}

export default function FilterBar({ branches, items, onApply }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateStart, setDateStart] = useState(today);
  const [dateEnd, setDateEnd] = useState(today);
  const [branchId, setBranchId] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [itemId, setItemId] = useState("all");

  return (
    <div className="flex flex-wrap gap-4 items-end p-4 bg-card border rounded-lg">
      <div className="flex flex-col gap-1.5">
        <Label>From</Label>
        <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-36" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>To</Label>
        <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-36" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Branch</Label>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Payment Mode</Label>
        <Select value={paymentMode} onValueChange={setPaymentMode}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Item</Label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => onApply({ dateStart, dateEnd, branchId, paymentMode, itemId })}>
        Apply Filters
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/dashboard/d-drive/components/BranchSummaryCards.tsx`**

```tsx
"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BranchSummary {
  branch_id: number;
  branch_name: string;
  ticket_count: number;
  total: number;
  cash: number;
  upi: number;
  online: number;
}

interface Props {
  summaries: BranchSummary[];
  onReconcile: (branchId: number, branchName: string, cashTotal: number) => void;
  loading: boolean;
}

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BranchSummaryCards({ summaries, onReconcile, loading }: Props) {
  if (loading) return <div className="text-muted-foreground py-6">Loading summaries…</div>;
  if (!summaries.length) return <div className="text-muted-foreground py-6">No data for selected filters.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {summaries.map(s => (
        <Card key={s.branch_id}>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{s.branch_name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{s.ticket_count} tickets</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReconcile(s.branch_id, s.branch_name, s.cash)}
            >
              Process Reconciliation
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total", value: s.total, className: "text-foreground" },
                { label: "Cash", value: s.cash, className: "text-emerald-600 dark:text-emerald-400" },
                { label: "UPI", value: s.upi, className: "text-blue-600 dark:text-blue-400" },
                { label: "Online", value: s.online, className: "text-amber-600 dark:text-amber-400" },
              ].map(({ label, value, className }) => (
                <div key={label} className="bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-bold text-sm ${className}`}>{fmt(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/dashboard/d-drive/components/TicketTable.tsx`**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Ticket {
  id: number;
  ticket_date: string;
  branch_name: string;
  payment_mode: string;
  net_amount: number;
  operator_name: string;
  item_summary: string;
}

interface Props {
  tickets: Ticket[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (p: number) => void;
}

const modeVariant: Record<string, string> = {
  CASH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  UPI: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ONLINE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

export default function TicketTable({ tickets, total, page, totalPages, loading, onPageChange }: Props) {
  if (loading) return <div className="text-muted-foreground py-6">Loading tickets…</div>;

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
          <tr>
            {["Ticket ID", "Date", "Branch", "Mode", "Amount", "Operator", "Items"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t, i) => (
            <tr key={t.id} className={`border-t ${i % 2 === 1 ? "bg-muted/20" : ""} hover:bg-muted/30`}>
              <td className="px-4 py-2.5 font-mono text-primary">#{t.id}</td>
              <td className="px-4 py-2.5">{t.ticket_date}</td>
              <td className="px-4 py-2.5">{t.branch_name}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${modeVariant[t.payment_mode] ?? ""}`}>
                  {t.payment_mode}
                </span>
              </td>
              <td className="px-4 py-2.5 font-semibold">
                ₹{t.net_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{t.operator_name ?? "—"}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{t.item_summary}</td>
            </tr>
          ))}
          {!tickets.length && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No tickets found.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-sm text-muted-foreground">
        <span>Showing page {page} of {totalPages} ({total} total)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/dashboard/d-drive/components/AdjustmentModal.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import DryRunPreview from "./DryRunPreview";

interface Props {
  open: boolean;
  branchId: number;
  branchName: string;
  cashTotal: number;
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
  onCommitted: () => void;
}

export default function AdjustmentModal({
  open, branchId, branchName, cashTotal, dateStart, dateEnd, onClose, onCommitted,
}: Props) {
  const [amount, setAmount] = useState("");
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDryRun = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    if (amt > cashTotal) { setError(`Amount exceeds cash total (₹${cashTotal.toFixed(2)})`); return; }
    setLoading(true);
    try {
      const res = await api.post("/api/admin/d-drive/adjustment/dry-run", {
        branch_id: branchId,
        date_start: dateStart,
        date_end: dateEnd,
        adjustment_amount: amt,
      });
      setDryRunResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Dry-run failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(""); setDryRunResult(null); setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Reconciliation — {branchName}</DialogTitle>
          <p className="text-sm text-muted-foreground">Cash eligible: ₹{cashTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
        </DialogHeader>

        {!dryRunResult ? (
          <>
            <div className="space-y-2">
              <Label>Adjustment Amount (₹)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="text-xl font-semibold"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleDryRun} disabled={loading}>
                {loading ? "Calculating…" : "Run Dry-Run Preview →"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DryRunPreview
            result={dryRunResult}
            onCancel={() => setDryRunResult(null)}
            onCommitted={() => { handleClose(); onCommitted(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/dashboard/d-drive/components/DryRunPreview.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Props {
  result: {
    batch_id: string;
    summary: {
      cash_total_before: number;
      total_adjustment_applied: number;
      cash_total_after: number;
      tickets_affected: number;
      items_affected: number;
      amount_not_applied: number;
    };
  };
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function DryRunPreview({ result, onCancel, onCommitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { summary, batch_id } = result;

  const handleCommit = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/d-drive/adjustment/commit", { batch_id });
      onCommitted();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Commit failed");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Dry-Run Preview — review before applying</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Cash Before", value: fmt(summary.cash_total_before) },
          { label: "Adjustment Applied", value: fmt(summary.total_adjustment_applied), accent: "text-destructive" },
          { label: "Cash After", value: fmt(summary.cash_total_after), accent: "text-emerald-600 dark:text-emerald-400" },
          { label: "Not Applied", value: fmt(summary.amount_not_applied) },
          { label: "Tickets Affected", value: String(summary.tickets_affected) },
          { label: "Items Modified", value: String(summary.items_affected) },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-muted/50 rounded p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`font-bold text-sm mt-0.5 ${accent ?? ""}`}>{value}</p>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
        <Button className="flex-1" onClick={handleCommit} disabled={loading}>
          {loading ? "Applying…" : "Confirm & Apply"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/src/app/dashboard/d-drive/page.tsx`**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import FilterBar, { Filters } from "./components/FilterBar";
import BranchSummaryCards from "./components/BranchSummaryCards";
import TicketTable from "./components/TicketTable";
import AdjustmentModal from "./components/AdjustmentModal";

export default function DDrivePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState<Filters>({
    dateStart: today, dateEnd: today, branchId: "all", paymentMode: "all", itemId: "all",
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [ticketData, setTicketData] = useState<any>({ tickets: [], total: 0, page: 1, total_pages: 1 });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<{ branchId: number; branchName: string; cashTotal: number } | null>(null);

  useEffect(() => {
    api.get("/api/branches").then(r => setBranches(r.data?.branches ?? r.data ?? []));
    api.get("/api/items").then(r => setItems(r.data?.items ?? r.data ?? []));
  }, []);

  const buildParams = (f: Filters, page = 1) => {
    const p: Record<string, string> = {
      date_start: f.dateStart,
      date_end: f.dateEnd,
    };
    if (f.branchId !== "all") p.branch_id = f.branchId;
    if (f.paymentMode !== "all") p.payment_mode = f.paymentMode;
    if (f.itemId !== "all") p.item_id = f.itemId;
    if (page > 1) p.page = String(page);
    return p;
  };

  const loadData = useCallback(async (f: Filters, page = 1) => {
    const params = buildParams(f, page);
    setSummaryLoading(true);
    setTicketsLoading(true);
    api.get("/api/admin/d-drive/summary", { params })
      .then(r => setSummaries(r.data))
      .finally(() => setSummaryLoading(false));
    api.get("/api/admin/d-drive/tickets", { params })
      .then(r => setTicketData(r.data))
      .finally(() => setTicketsLoading(false));
  }, []);

  const handleApply = (f: Filters) => {
    setFilters(f);
    loadData(f);
  };

  useEffect(() => { loadData(filters); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">D Drive</h1>
        <p className="text-muted-foreground text-sm mt-1">Branch-wise ticket collection and reconciliation</p>
      </div>

      <FilterBar branches={branches} items={items} onApply={handleApply} />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Branch Summary</h2>
        <BranchSummaryCards
          summaries={summaries}
          loading={summaryLoading}
          onReconcile={(branchId, branchName, cashTotal) =>
            setReconcileTarget({ branchId, branchName, cashTotal })
          }
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tickets</h2>
        <TicketTable
          tickets={ticketData.tickets}
          total={ticketData.total}
          page={ticketData.page}
          totalPages={ticketData.total_pages}
          loading={ticketsLoading}
          onPageChange={p => loadData(filters, p)}
        />
      </div>

      {reconcileTarget && (
        <AdjustmentModal
          open={true}
          branchId={reconcileTarget.branchId}
          branchName={reconcileTarget.branchName}
          cashTotal={reconcileTarget.cashTotal}
          dateStart={filters.dateStart}
          dateEnd={filters.dateEnd}
          onClose={() => setReconcileTarget(null)}
          onCommitted={() => { setReconcileTarget(null); loadData(filters); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/d-drive/
git commit -m "feat: add D Drive frontend page and components"
```

---

## Task 10: Frontend Parameter Master Page

**Files:** `parameter-master/page.tsx` and components

- [ ] **Step 1: Create `frontend/src/app/dashboard/parameter-master/components/PreviewModal.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Props {
  ruleId: number | null;
  branchId: string;
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
}

export default function PreviewModal({ ruleId, branchId, dateStart, dateEnd, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ruleId) return;
    setLoading(true);
    api.post(`/api/admin/parameter-master/${ruleId}/preview`, {
      branch_id: branchId !== "all" ? parseInt(branchId) : null,
      date_start: dateStart,
      date_end: dateEnd,
    })
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [ruleId]);

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Dialog open={!!ruleId} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rule Preview</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-muted-foreground py-4">Loading…</p>}
        {data && !loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Eligible Tickets", value: String(data.eligible_tickets) },
              { label: "Eligible Items", value: String(data.eligible_items) },
              { label: "Cash Total", value: fmt(data.cash_total) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-bold text-sm mt-1">{value}</p>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/dashboard/parameter-master/components/RuleModal.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";

interface Rule {
  id?: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_adjustment_per_ticket: number | null;
  max_adjustment_per_item: number | null;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
}

interface Props {
  rule: Rule | null;
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
  onSaved: () => void;
  onClose: () => void;
}

const EMPTY: Rule = {
  priority_order: 1,
  branch_scope: null,
  item_id: null,
  payment_mode: "CASH",
  ticket_selection_order: "FIFO",
  max_adjustment_per_ticket: null,
  max_adjustment_per_item: null,
  max_total_adjustment_per_rule: null,
  stop_on_match: false,
};

export default function RuleModal({ rule, branches, items, onSaved, onClose }: Props) {
  const [form, setForm] = useState<Rule>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setForm(rule ?? EMPTY); setError(""); }, [rule]);

  const set = (k: keyof Rule, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        branch_scope: form.branch_scope || null,
        item_id: form.item_id || null,
        max_adjustment_per_ticket: form.max_adjustment_per_ticket || null,
        max_adjustment_per_item: form.max_adjustment_per_item || null,
        max_total_adjustment_per_rule: form.max_total_adjustment_per_rule || null,
        ticket_conditions: {},
        item_conditions: {},
      };
      if (form.id) {
        await api.put(`/api/admin/parameter-master/${form.id}`, payload);
      } else {
        await api.post("/api/admin/parameter-master", payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Rule" : "New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Priority Order</Label>
            <Input type="number" value={form.priority_order} onChange={e => set("priority_order", parseInt(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Ticket Selection Order</Label>
            <Select value={form.ticket_selection_order} onValueChange={v => set("ticket_selection_order", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["FIFO", "LIFO", "HIGHEST_VALUE", "LOWEST_VALUE"].map(o =>
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branch Scope</Label>
            <Select value={String(form.branch_scope ?? "all")} onValueChange={v => set("branch_scope", v === "all" ? null : parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={String(form.item_id ?? "all")} onValueChange={v => set("item_id", v === "all" ? null : parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Max / Rule (₹)</Label>
            <Input type="number" placeholder="No limit" value={form.max_total_adjustment_per_rule ?? ""} onChange={e => set("max_total_adjustment_per_rule", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max / Ticket (₹)</Label>
            <Input type="number" placeholder="No limit" value={form.max_adjustment_per_ticket ?? ""} onChange={e => set("max_adjustment_per_ticket", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max / Item (₹)</Label>
            <Input type="number" placeholder="No limit" value={form.max_adjustment_per_item ?? ""} onChange={e => set("max_adjustment_per_item", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div className="flex items-center gap-3 pt-4">
            <Switch checked={form.stop_on_match} onCheckedChange={v => set("stop_on_match", v)} />
            <Label>Stop on match</Label>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving…" : "Save Rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/dashboard/parameter-master/components/RuleTable.tsx`**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Rule {
  id: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
  is_active: boolean;
}

interface Props {
  rules: Rule[];
  isSuperAdmin: boolean;
  onEdit: (rule: Rule) => void;
  onToggle: (rule: Rule) => void;
  onPreview: (ruleId: number) => void;
  branches: { id: number; name: string }[];
  items: { id: number; name: string }[];
}

export default function RuleTable({ rules, isSuperAdmin, onEdit, onToggle, onPreview, branches, items }: Props) {
  const branchName = (id: number | null) => id ? (branches.find(b => b.id === id)?.name ?? id) : "All";
  const itemName = (id: number | null) => id ? (items.find(i => i.id === id)?.name ?? id) : "All";

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
          <tr>
            {["#", "Branch", "Item", "Mode", "Order", "Max/Rule", "Stop", "Status", "Actions"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id} className={`border-t hover:bg-muted/20 ${!r.is_active ? "opacity-50" : ""}`}>
              <td className="px-4 py-2.5 font-bold text-muted-foreground">{r.priority_order}</td>
              <td className="px-4 py-2.5">{branchName(r.branch_scope)}</td>
              <td className="px-4 py-2.5">{itemName(r.item_id)}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                  {r.payment_mode}
                </span>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.ticket_selection_order}</td>
              <td className="px-4 py-2.5">{r.max_total_adjustment_per_rule != null ? `₹${r.max_total_adjustment_per_rule}` : "—"}</td>
              <td className="px-4 py-2.5">{r.stop_on_match ? "Yes" : "No"}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onPreview(r.id)}>Preview</Button>
                  {isSuperAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => onToggle(r)}>
                        {r.is_active ? "Disable" : "Enable"}
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rules.length && (
            <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No rules defined yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/dashboard/parameter-master/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/DashboardUserContext";
import RuleTable from "./components/RuleTable";
import RuleModal from "./components/RuleModal";
import PreviewModal from "./components/PreviewModal";

const today = new Date().toISOString().slice(0, 10);

export default function ParameterMasterPage() {
  const user = useDashboardUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [rules, setRules] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewRuleId, setPreviewRuleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRules = () =>
    api.get("/api/admin/parameter-master").then(r => setRules(r.data));

  useEffect(() => {
    Promise.all([
      api.get("/api/branches").then(r => setBranches(r.data?.branches ?? r.data ?? [])),
      api.get("/api/items").then(r => setItems(r.data?.items ?? r.data ?? [])),
      loadRules(),
    ]).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (rule: any) => {
    await api.patch(`/api/admin/parameter-master/${rule.id}/status`, { is_active: !rule.is_active });
    await loadRules();
  };

  if (loading) return <div className="py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Parameter Master</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adjustment rules — applied in priority order during reconciliation
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Rule
          </Button>
        )}
      </div>

      <RuleTable
        rules={rules}
        isSuperAdmin={isSuperAdmin}
        branches={branches}
        items={items}
        onEdit={rule => setEditingRule(rule)}
        onToggle={handleToggle}
        onPreview={id => setPreviewRuleId(id)}
      />

      {(showCreate || editingRule) && (
        <RuleModal
          rule={editingRule}
          branches={branches}
          items={items}
          onSaved={async () => {
            await loadRules();
            setShowCreate(false);
            setEditingRule(null);
          }}
          onClose={() => { setShowCreate(false); setEditingRule(null); }}
        />
      )}

      <PreviewModal
        ruleId={previewRuleId}
        branchId="all"
        dateStart={today}
        dateEnd={today}
        onClose={() => setPreviewRuleId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/parameter-master/
git commit -m "feat: add Parameter Master frontend page and components"
```

---

## Task 11: Frontend Settings — User Access Tab

**Files:** `user-access-tab.tsx`, `settings/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/dashboard/settings/components/user-access-tab.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";

interface UserAccess {
  user_id: string;
  full_name: string;
  username: string;
  is_granted: boolean;
  granted_at: string | null;
}

export default function UserAccessTab() {
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () =>
    api.get("/api/admin/user-access").then(r => setUsers(r.data)).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = async (u: UserAccess) => {
    setSaving(u.user_id);
    try {
      await api.put(`/api/admin/user-access/${u.user_id}`, { is_granted: !u.is_granted });
      await load();
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="py-6 text-muted-foreground">Loading users…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Admin Portal Access</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Grant or revoke access to admin.carferry.online for each Admin user.
        </p>
      </div>
      <div className="border rounded-lg divide-y">
        {users.map(u => (
          <div key={u.user_id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-sm">{u.full_name}</p>
              <p className="text-xs text-muted-foreground">@{u.username}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {u.is_granted ? "Access granted" : "No access"}
              </span>
              <Switch
                checked={u.is_granted}
                disabled={saving === u.user_id}
                onCheckedChange={() => toggle(u)}
              />
            </div>
          </div>
        ))}
        {!users.length && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No Admin users found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/app/dashboard/settings/page.tsx`**

Add import at the top (after other tab imports):
```tsx
import UserAccessTab from "./components/user-access-tab";
```

Add `"Users"` icon import to lucide imports:
```tsx
import { Settings, Palette, Mail, HardDrive, Clock, Shield, Users } from "lucide-react";
```

Update `TabId` type:
```tsx
type TabId = "general" | "operations" | "appearance" | "notifications" | "backups" | "screen-access" | "user-access";
```

Update `TABS` array — add inside the `isAdminPortal` condition alongside `screen-access`:
```tsx
  ...(isAdminPortal
    ? [
        { id: "screen-access" as const, label: "Screen Access", icon: Shield },
        { id: "user-access" as const, label: "User Access", icon: Users },
      ]
    : []),
```

Update `visibleTabs` filter to include `"user-access"` in the SUPER_ADMIN-only tabs:
```tsx
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "operations" || tab.id === "backups" || tab.id === "screen-access" || tab.id === "user-access")
      return user?.role === "SUPER_ADMIN";
    return true;
  });
```

Add `UserAccessTab` to the render switch (in the tab content area, alongside other `activeTab === "..."` conditions):
```tsx
          {activeTab === "user-access" && <UserAccessTab />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/settings/components/user-access-tab.tsx frontend/src/app/dashboard/settings/page.tsx
git commit -m "feat: add User Access tab to Settings for admin portal access control"
```

---

## Task 12: Final Wiring Verification

- [ ] **Step 1: Verify backend compiles and starts**

```bash
cd backend
uvicorn app.main:app --reload --env-file .env.development
```

Expected: no import errors. Routes `/api/admin/d-drive/summary`, `/api/admin/parameter-master`, `/api/admin/user-access` appear in startup logs.

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend
npm run build
```

Expected: no TypeScript errors. Build completes successfully.

- [ ] **Step 3: Smoke-test admin portal locally**
  - Log in as `superadmin` on localhost
  - Confirm "D Drive" and "Parameter Master" appear in sidebar under RECONCILIATION section
  - Confirm Settings → "User Access" tab appears
  - Navigate to D Drive — confirm filter bar loads and summary cards appear (may be empty if no data)
  - Navigate to Parameter Master — confirm empty rules table with "New Rule" button
  - Click "New Rule", fill in priority_order=1, save — confirm it appears in table

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete D Drive + Parameter Master admin screens"
```

---

## Notes

**Running migrations on Server 2:**
```bash
ssh user@194.164.148.228
cd /path/to/ssmspl/backend
source .venv/bin/activate
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/ssmspl_admin alembic upgrade head
```

**ticket_items.last_adjustment_id caveat:** If `scripts/refresh_admin_db.sh` is ever run to reset ssmspl_admin from ssmspl_sync, this column will be dropped (because the subscriber table is recreated). After any refresh, re-run `alembic upgrade head` to restore the column.

**Parameter Master rules:** The `ticket_conditions` and `item_conditions` JSONB fields are stored but not yet evaluated by the engine. They are available for the client to define their rule predicate format. When the client specifies the format, add an `_evaluate_conditions(item, conditions)` function to `admin_adjustment_engine.py` and call it in `_fetch_eligible_items_for_rule`.
