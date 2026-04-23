from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_screen_toggle import AdminScreenToggle

# Screens that can be toggled — Dashboard and System Settings are always on
TOGGLEABLE_SCREENS: list[str] = [
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
    "Admin Reports",
    "Rate Change Logs",
    "Employee Transfer",
    "Ticket Verification",
    "User Sessions",
    # Permission toggles (not screens — default OFF since they grant destructive capabilities)
    "Admin Rollback Access",
]

# These screens are always visible and cannot be turned off
ALWAYS_ON_SCREENS: set[str] = {"Dashboard", "System Settings"}

# Entries in TOGGLEABLE_SCREENS that are permissions, not navigable screens.
# These entries do NOT filter menu items in /api/auth/me. They are read by
# specific feature code to gate privileged operations (e.g., rollback).
# They default to FALSE on seed (opt-in to grant, not opt-out).
PERMISSION_TOGGLES: set[str] = {
    "Admin Rollback Access",
}


async def _seed_defaults(db: AsyncSession) -> None:
    """Insert default rows for any missing toggleable screens.
    Screens default to TRUE (enabled). Permission toggles default to FALSE (denied).
    """
    result = await db.execute(select(AdminScreenToggle.screen_name))
    existing = {row[0] for row in result.all()}
    missing = set(TOGGLEABLE_SCREENS) - existing
    if missing:
        for name in TOGGLEABLE_SCREENS:
            if name in missing:
                default_enabled = name not in PERMISSION_TOGGLES
                db.add(AdminScreenToggle(screen_name=name, is_enabled=default_enabled))
        await db.flush()


async def is_permission_enabled(db: AsyncSession, permission_name: str) -> bool:
    """Check whether a specific permission toggle is currently enabled.
    Returns False if the toggle doesn't exist (safest default for unknown permissions).
    """
    await _seed_defaults(db)
    result = await db.execute(
        select(AdminScreenToggle.is_enabled).where(
            AdminScreenToggle.screen_name == permission_name
        )
    )
    row = result.scalar_one_or_none()
    return bool(row)


async def get_all_toggles(db: AsyncSession) -> list[AdminScreenToggle]:
    """Return all toggles, seeding defaults for any missing screens."""
    await _seed_defaults(db)
    result = await db.execute(
        select(AdminScreenToggle).order_by(AdminScreenToggle.id)
    )
    return list(result.scalars().all())


async def get_enabled_screens(db: AsyncSession) -> set[str]:
    """Return the set of screen names that are currently enabled (excluding permission toggles)."""
    await _seed_defaults(db)
    result = await db.execute(
        select(AdminScreenToggle.screen_name).where(
            AdminScreenToggle.is_enabled == True  # noqa: E712
        )
    )
    enabled = {row[0] for row in result.all()} - PERMISSION_TOGGLES
    return enabled | ALWAYS_ON_SCREENS


async def bulk_update_toggles(
    db: AsyncSession, updates: dict[str, bool]
) -> list[AdminScreenToggle]:
    """Update multiple screen toggles at once. Returns all toggles after update."""
    await _seed_defaults(db)
    result = await db.execute(select(AdminScreenToggle))
    all_toggles = {t.screen_name: t for t in result.scalars().all()}
    for screen_name, is_enabled in updates.items():
        if screen_name in all_toggles and screen_name not in ALWAYS_ON_SCREENS:
            all_toggles[screen_name].is_enabled = is_enabled
    await db.flush()
    return sorted(all_toggles.values(), key=lambda t: t.id)
