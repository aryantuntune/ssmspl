#!/usr/bin/env python3
"""
Item ID Renumber Script
=======================
Compacts gaps in the `items` primary key so the active item IDs become
consecutive (1, 2, 3, ...). The Items master only shows ACTIVE items, so
operators expect to type the same numbers they see in the master. After the
V1->V2 migration, deactivated V1 items leave gaps and post-migration items
get high auto-incremented IDs (e.g. 154+), breaking that expectation.

This script DOES NOT hardcode any item IDs. It:
  1. Reads all active items from the database
  2. Finds gaps in the active-ID sequence
  3. Proposes a remapping that fills the gaps from the top

Default mode is diagnostic-only (read-only). Nothing changes unless you pass
--dry-run (transaction rolled back at the end) or --apply (commits).

WHAT IT TOUCHES
---------------
Updates `items.id` and every reference column:
    - item_rates             (FK)
    - ticket_items           (FK)
    - booking_items          (logical reference, no FK)
    - rate_change_logs       (FK)
    - item_rate_history      (audit log, no FK)
    - item_migration_map     (audit log, no FK — both old_item_id and new_item_id)
    - parameter_master       (FK)

FKs are dropped, updates run, FKs are re-added — all inside a single
transaction so any failure rolls back cleanly. Inactive items occupying
target IDs are stashed to id + --stash-offset (default 9000).

Run during a maintenance window with the API server stopped.

USAGE
-----
    # Diagnose only (read-only, shows discovered items + proposed remap)
    python scripts/renumber_items.py --env .env.production

    # Auto-compact: preview the transaction
    python scripts/renumber_items.py --auto-compact --dry-run

    # Auto-compact: apply for real
    python scripts/renumber_items.py --auto-compact --apply

    # Or override with an explicit mapping
    python scripts/renumber_items.py --remap "154:22,155:23,156:24" --apply

DESIGN
------
- No hardcoded source/target IDs. Source IDs come from the database.
- Idempotent: re-running after a successful apply is a no-op (no gaps left).
- Source must be ACTIVE. Refuses to renumber inactive items (they're history).
- Target ID conflicts: refuses if active item already there; auto-stashes if
  inactive item is there.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent

_ENV_CANDIDATES = [
    BACKEND_DIR / ".env.production",
    BACKEND_DIR / ".env.development",
]
DEFAULT_ENV = next((p for p in _ENV_CANDIDATES if p.exists()), BACKEND_DIR / ".env.development")

# Tables that hold an item_id reference. (table, column, fk_name_or_None)
ITEM_REF_TABLES = [
    ("item_rates",         "item_id", "item_rates_item_id_fkey"),
    ("ticket_items",       "item_id", "ticket_items_item_id_fkey"),
    ("booking_items",      "item_id", None),
    ("rate_change_logs",   "item_id", "rate_change_logs_item_id_fkey"),
    ("item_rate_history",  "item_id", None),
    ("parameter_master",   "item_id", "parameter_master_item_id_fkey"),
]

# Audit-log tables that store *both* old_item_id and new_item_id.
ITEM_REF_AUDIT_TABLES = [
    ("item_migration_map", "old_item_id"),
    ("item_migration_map", "new_item_id"),
]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def parse_explicit_remap(raw: str) -> dict[int, int]:
    out: dict[int, int] = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if not pair:
            continue
        try:
            old_s, new_s = pair.split(":")
            out[int(old_s)] = int(new_s)
        except ValueError:
            sys.exit(f"ERROR: bad --remap pair {pair!r}, expected 'old:new'")
    if not out:
        sys.exit("ERROR: --remap parsed empty")
    if len(set(out.values())) != len(out):
        sys.exit("ERROR: --remap target IDs must be unique")
    if set(out.keys()) & set(out.values()):
        sys.exit("ERROR: --remap source and target IDs must not overlap")
    return out


def load_database_url(env_path: Path) -> str:
    if not env_path.exists():
        sys.exit(f"ERROR: env file not found: {env_path}")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            if key.strip() == "DATABASE_URL":
                url = val.strip().strip("'\"")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    sys.exit(f"ERROR: DATABASE_URL not found in {env_path}")


def header(title: str) -> None:
    print(f"\n{'-'*60}")
    print(f"  {title}")
    print(f"{'-'*60}")


# --------------------------------------------------------------------------
# Discover: read items table, identify gaps, propose remap
# --------------------------------------------------------------------------
async def discover_items(conn) -> tuple[list[dict], list[dict], dict[int, int]]:
    """Return (active_items, inactive_items, proposed_remap).

    Auto-compact algorithm: walk active IDs ascending and remap each one to the
    smallest target slot not occupied by another ACTIVE item. Inactive items
    occupying target slots are ignored here — they get stashed at apply time.
    """
    rows = await conn.fetch(
        "SELECT id, name, short_name, is_active FROM items ORDER BY id"
    )
    active   = [dict(r) for r in rows if r["is_active"]]
    inactive = [dict(r) for r in rows if not r["is_active"]]

    active_ids = sorted(r["id"] for r in active)
    # Mutable: as we propose a remap, the source becomes free and the target is taken.
    live = set(active_ids)

    proposed: dict[int, int] = {}
    next_target = 1
    for src in active_ids:
        # Advance next_target past any slots taken by *another* still-live active item.
        while next_target in live and next_target != src:
            next_target += 1
        if src == next_target:
            next_target += 1
            continue
        # src > next_target — propose remap to fill the gap.
        proposed[src] = next_target
        live.discard(src)
        live.add(next_target)
        next_target += 1

    return active, inactive, proposed


def print_discovery(active: list[dict], inactive: list[dict], proposed: dict[int, int]) -> None:
    header("Discovered items in database")

    print(f"\n  Active items: {len(active)}")
    for r in active:
        marker = ""
        if r["id"] in proposed:
            marker = f"  -> {proposed[r['id']]}"
        print(f"    id={r['id']:4}  '{r['name']}'  short='{r['short_name']}'{marker}")

    if inactive:
        print(f"\n  Inactive items: {len(inactive)}")
        for r in inactive:
            print(f"    id={r['id']:4}  '{r['name']}'  (inactive)")
    else:
        print("\n  Inactive items: none")

    if proposed:
        print(f"\n  Proposed auto-compact remap ({len(proposed)} item(s)):")
        for old, new in proposed.items():
            print(f"    {old:4} -> {new}")
    else:
        print("\n  No gaps detected — active IDs are already consecutive from 1.")


# --------------------------------------------------------------------------
# Validate explicit/proposed remap against the database
# --------------------------------------------------------------------------
async def validate_remap(
    conn,
    remap: dict[int, int],
    active: list[dict],
    inactive: list[dict],
) -> dict:
    header("Validating remap against database")

    active_by_id   = {r["id"]: r for r in active}
    inactive_by_id = {r["id"]: r for r in inactive}

    src_active   : list[dict] = []
    src_missing  : list[int]  = []
    src_inactive : list[dict] = []
    dst_active   : list[dict] = []
    dst_inactive : list[dict] = []

    for old, new in remap.items():
        if old in active_by_id:
            src_active.append(active_by_id[old])
        elif old in inactive_by_id:
            src_inactive.append(inactive_by_id[old])
        else:
            src_missing.append(old)

        if new in active_by_id and new != old:
            dst_active.append(active_by_id[new])
        elif new in inactive_by_id and new != old:
            dst_inactive.append(inactive_by_id[new])

    print(f"  Source IDs ACTIVE   : {len(src_active)}")
    print(f"  Source IDs missing  : {len(src_missing)}  {src_missing if src_missing else ''}")
    print(f"  Source IDs INACTIVE : {len(src_inactive)}")
    print(f"  Target ACTIVE clash : {len(dst_active)}")
    print(f"  Target INACTIVE     : {len(dst_inactive)}  (will be stashed)")

    fatal: list[str] = []
    if src_missing:
        fatal.append(f"source IDs not found in items table: {src_missing}")
    if src_inactive:
        ids = [r["id"] for r in src_inactive]
        fatal.append(f"refusing to renumber INACTIVE source IDs (history rows): {ids}")
    if dst_active:
        ids = [r["id"] for r in dst_active]
        fatal.append(f"target IDs occupied by ACTIVE items: {ids}")

    # Per-table reference counts for the source IDs (informational)
    src_ids = list(remap.keys())
    if src_ids:
        print("\n  Reference counts for source IDs:")
        for table, col, _ in ITEM_REF_TABLES:
            cnt = await conn.fetchval(
                f"SELECT COUNT(*) FROM {table} WHERE {col} = ANY($1::int[])",
                src_ids,
            )
            print(f"    {table:24} {col:14} : {cnt}")

    return {
        "fatal": fatal,
        "stash_needed": [r["id"] for r in dst_inactive],
    }


# --------------------------------------------------------------------------
# Stash inactive items at target IDs out to spare slots
# --------------------------------------------------------------------------
async def stash_inactive(conn, ids_to_stash: list[int], stash_offset: int) -> dict[int, int]:
    if not ids_to_stash:
        return {}

    print(f"\n  Stashing {len(ids_to_stash)} inactive item(s) by +{stash_offset}:")
    stash_map: dict[int, int] = {}
    for old in ids_to_stash:
        candidate = old + stash_offset
        # Find a truly empty slot
        for _ in range(100):
            clash = await conn.fetchval("SELECT 1 FROM items WHERE id = $1", candidate)
            if not clash:
                break
            candidate += 1
        else:
            sys.exit(f"ERROR: could not find a free stash slot near {old + stash_offset}")
        stash_map[old] = candidate
        print(f"    {old} -> {candidate}")
    return stash_map


# --------------------------------------------------------------------------
# Apply the renumber inside a transaction
# --------------------------------------------------------------------------
async def apply_renumber(
    conn,
    remap: dict[int, int],
    stash_map: dict[int, int],
) -> None:
    header("Applying renumber (inside transaction)")

    fks = [(t, fk) for t, _c, fk in ITEM_REF_TABLES if fk]

    # 1. Drop FKs that target items.id so the PK update doesn't cascade-fail.
    for table, fk_name in fks:
        await conn.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {fk_name}")
    print(f"  Dropped {len(fks)} FK constraint(s).")

    async def move(old: int, new: int) -> dict[str, int]:
        per: dict[str, int] = {}
        await conn.execute("UPDATE items SET id = $1 WHERE id = $2", new, old)
        for table, col, _ in ITEM_REF_TABLES:
            res = await conn.execute(
                f"UPDATE {table} SET {col} = $1 WHERE {col} = $2", new, old,
            )
            per[table] = int(res.split()[-1]) if res.startswith("UPDATE") else 0
        for table, col in ITEM_REF_AUDIT_TABLES:
            res = await conn.execute(
                f"UPDATE {table} SET {col} = $1 WHERE {col} = $2", new, old,
            )
            per[f"{table}.{col}"] = int(res.split()[-1]) if res.startswith("UPDATE") else 0
        return per

    # 2. Stash any inactive items occupying target slots.
    if stash_map:
        for old, new in stash_map.items():
            await move(old, new)
        print(f"  Stashed {len(stash_map)} inactive item(s).")

    # 3. Renumber sources to targets.
    totals: dict[str, int] = {}
    for old, new in remap.items():
        per = await move(old, new)
        for k, v in per.items():
            totals[k] = totals.get(k, 0) + v
        print(f"  Renumbered item {old} -> {new}")

    print("\n  Per-table rows updated:")
    for k, v in totals.items():
        print(f"    {k:36} : {v}")

    # 4. Re-create the FKs.
    for table, fk_name in fks:
        await conn.execute(
            f"ALTER TABLE {table} "
            f"ADD CONSTRAINT {fk_name} "
            f"FOREIGN KEY (item_id) REFERENCES items(id)"
        )
    print(f"  Re-created {len(fks)} FK constraint(s).")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
async def async_main(args: argparse.Namespace) -> None:
    import asyncpg

    if args.remap and args.auto_compact:
        sys.exit("ERROR: choose either --remap or --auto-compact, not both.")
    if args.apply and args.dry_run:
        sys.exit("ERROR: choose either --apply or --dry-run, not both.")

    print(f"\n{'='*60}")
    if args.apply:
        mode = "APPLY (writes will commit)"
    elif args.dry_run:
        mode = "DRY RUN (transaction rolled back)"
    else:
        mode = "DIAGNOSTIC ONLY (read-only)"
    print(f"  Item Renumber  [{mode}]")
    print(f"  Env: {args.env}")
    print(f"{'='*60}")

    db_url = load_database_url(Path(args.env))
    conn = await asyncpg.connect(db_url)

    try:
        active, inactive, proposed = await discover_items(conn)
        print_discovery(active, inactive, proposed)

        # Decide which mapping to use
        if args.remap:
            remap = parse_explicit_remap(args.remap)
            print(f"\n  Using explicit --remap ({len(remap)} pairs).")
        elif args.auto_compact:
            remap = proposed
            print(f"\n  Using auto-compact remap ({len(remap)} pairs).")
        else:
            print("\n  No --remap or --auto-compact — diagnostic-only.")
            print("  Re-run with --auto-compact --dry-run to preview the proposed transaction,")
            print("  or with --remap \"OLD:NEW,...\" to provide an explicit mapping.\n")
            return

        if not remap:
            print("  Nothing to renumber. Exiting.")
            return

        validation = await validate_remap(conn, remap, active, inactive)

        if validation["fatal"]:
            print("\nERROR: validation failed:")
            for msg in validation["fatal"]:
                print(f"  - {msg}")
            sys.exit(1)

        if not args.apply and not args.dry_run:
            print("\n  Validation OK. Re-run with --dry-run or --apply to proceed.")
            return

        async with conn.transaction():
            stash_map = await stash_inactive(
                conn, validation["stash_needed"], args.stash_offset
            )
            await apply_renumber(conn, remap, stash_map)

            if args.dry_run:
                print("\n  DRY RUN — rolling back transaction.")
                raise asyncpg.PostgresError("dry-run rollback")

    except asyncpg.PostgresError as e:
        if args.dry_run and "dry-run rollback" in str(e):
            pass
        else:
            print(f"\nERROR: {e}")
            sys.exit(1)
    finally:
        await conn.close()

    print(f"\n{'='*60}")
    if args.dry_run:
        print("  DRY RUN complete — no changes written.")
    elif args.apply:
        print("  Renumber complete.")
    else:
        print("  Diagnostic complete.")
    print(f"{'='*60}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Compact item-ID gaps in the items table and cascade through every "
            "FK reference. Discovers items from the database — no hardcoded IDs."
        ),
    )
    parser.add_argument(
        "--auto-compact", action="store_true",
        help="Use the auto-discovered remap that closes gaps in the active-ID sequence.",
    )
    parser.add_argument(
        "--remap", default=None,
        help='Explicit mapping, e.g. "154:22,155:23,156:24". Overrides --auto-compact.',
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run the full transaction then roll back. Shows every UPDATE.",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Write changes for real.",
    )
    parser.add_argument(
        "--stash-offset", type=int, default=9000,
        help="Offset added to inactive items occupying target IDs (default 9000).",
    )
    parser.add_argument(
        "--env", default=str(DEFAULT_ENV),
        help=f"Path to .env file with DATABASE_URL (default: {DEFAULT_ENV}).",
    )
    args = parser.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
