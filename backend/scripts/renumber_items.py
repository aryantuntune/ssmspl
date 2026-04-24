#!/usr/bin/env python3
"""
Item ID Renumber Script
=======================
Closes the gap left by the V1->V2 migration by renumbering specific item IDs
to consecutive low-numbered IDs that match what the operator sees in the
Item Master.

Default mapping (override with --remap):
    154 -> 22
    155 -> 23
    156 -> 24

WHY THIS EXISTS
---------------
After V1->V2 migration, V2 occupies IDs 1-21 and old V1-only items remain as
inactive rows occupying IDs 22-45 etc. New items added post-migration get
auto-incremented IDs starting from MAX(id)+1, which is well above 100.

The Items master only shows ACTIVE items, so operators see 1-21 + the new
ones (e.g. 154, 155, 156) and expect them to read like 22, 23, 24.

RISK / BLAST RADIUS
-------------------
This UPDATEs primary keys in `items` and CASCADES through every table that
references item_id:
    - item_rates             (FK)
    - ticket_items           (FK)
    - booking_items          (no FK, logical reference)
    - rate_change_logs       (FK)
    - item_rate_history      (no FK, audit log)
    - item_migration_map     (no FK, audit log)
    - parameter_master       (FK)

Run during a maintenance window. Stop the API server first to avoid mid-flight
inserts referencing the old IDs.

USAGE
-----
    # Preview only (no writes)
    python scripts/renumber_items.py --dry-run

    # Custom mapping
    python scripts/renumber_items.py --remap "154:22,155:23,156:24" --dry-run

    # Apply
    python scripts/renumber_items.py --apply

    # Use production env file
    python scripts/renumber_items.py --apply --env .env.production

DESIGN
------
- Single transaction. Either every table updates atomically or nothing changes.
- Pre-flight verifies source IDs exist and target IDs are free (or only inactive).
- If a target ID is occupied by an INACTIVE item, the script offers to move it
  aside to a high spare ID range (target + 9000) before renumbering.
- FK constraints are dropped, updates run, FKs are re-created — all in one
  transaction so a failure rolls back cleanly.
- Idempotent: running twice with the same mapping after a successful run is a
  no-op (source IDs no longer exist).
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

DEFAULT_REMAP = {154: 22, 155: 23, 156: 24}

# Tables that hold an item_id reference, with whether they have a real FK.
# Order matters: update child rows before bumping items.id so we don't violate
# the FK between the two UPDATEs (we drop FKs first, but listing children
# first keeps the diagnostic output readable).
ITEM_REF_TABLES = [
    ("item_rates",         "item_id", "item_rates_item_id_fkey",         True),
    ("ticket_items",       "item_id", "ticket_items_item_id_fkey",       True),
    ("booking_items",      "item_id", None,                              False),
    ("rate_change_logs",   "item_id", "rate_change_logs_item_id_fkey",   True),
    ("item_rate_history",  "item_id", None,                              False),
    ("parameter_master",   "item_id", "parameter_master_item_id_fkey",   True),
]

# Audit-log tables that store *both* old_item_id and new_item_id.
ITEM_REF_AUDIT_TABLES = [
    ("item_migration_map", "old_item_id"),
    ("item_migration_map", "new_item_id"),
]


def parse_remap(raw: str | None) -> dict[int, int]:
    if not raw:
        return dict(DEFAULT_REMAP)
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
# Diagnostics
# --------------------------------------------------------------------------
async def diagnose(conn, remap: dict[int, int]) -> dict:
    header("Pre-flight diagnostics")

    src_ids = list(remap.keys())
    dst_ids = list(remap.values())

    src_rows = await conn.fetch(
        "SELECT id, name, short_name, is_active FROM items "
        "WHERE id = ANY($1::int[]) ORDER BY id",
        src_ids,
    )
    dst_rows = await conn.fetch(
        "SELECT id, name, short_name, is_active FROM items "
        "WHERE id = ANY($1::int[]) ORDER BY id",
        dst_ids,
    )

    print("\n  Source rows (will be renumbered):")
    if not src_rows:
        print("    (none found — script is a no-op)")
    for r in src_rows:
        new_id = remap[r["id"]]
        flag = "ACTIVE" if r["is_active"] else "inactive"
        print(f"    {r['id']:4} -> {new_id:3}  [{flag:8}]  '{r['name']}'")

    print("\n  Target rows (must be free):")
    if not dst_rows:
        print("    (target IDs are free — clean renumber)")
    blockers: list[dict] = []
    for r in dst_rows:
        flag = "ACTIVE" if r["is_active"] else "inactive"
        blocker_kind = "BLOCKER (active)" if r["is_active"] else "stash needed"
        print(f"    {r['id']:4}  [{flag:8}]  '{r['name']}'  -> {blocker_kind}")
        blockers.append(dict(r))

    # Per-table reference counts for the source IDs
    print("\n  Reference counts in dependent tables:")
    ref_counts: dict[str, int] = {}
    for table, col, *_ in ITEM_REF_TABLES:
        cnt = await conn.fetchval(
            f"SELECT COUNT(*) FROM {table} WHERE {col} = ANY($1::int[])",
            src_ids,
        )
        print(f"    {table:24} {col:14} : {cnt}")
        ref_counts[table] = cnt

    return {
        "src_present": [dict(r) for r in src_rows],
        "dst_present": [dict(r) for r in dst_rows],
        "blockers": [b for b in blockers if b["is_active"]],
        "stash_needed": [b for b in blockers if not b["is_active"]],
        "ref_counts": ref_counts,
    }


# --------------------------------------------------------------------------
# Stash (move existing inactive items at target IDs out of the way)
# --------------------------------------------------------------------------
async def stash_inactive(conn, ids_to_stash: list[int], stash_offset: int) -> dict[int, int]:
    """Move inactive items at target IDs to high spare IDs (id + offset)."""
    if not ids_to_stash:
        return {}

    print(f"\n  Stashing {len(ids_to_stash)} inactive item(s) by +{stash_offset}:")
    stash_map: dict[int, int] = {}
    for old in ids_to_stash:
        new = old + stash_offset
        # Verify the spare slot is free
        clash = await conn.fetchval("SELECT 1 FROM items WHERE id = $1", new)
        if clash:
            sys.exit(f"ERROR: stash slot {new} is occupied — pick a different --stash-offset")
        stash_map[old] = new
        print(f"    {old:4} -> {new}")
    return stash_map


# --------------------------------------------------------------------------
# Apply (renumber) — runs inside a transaction
# --------------------------------------------------------------------------
async def apply_renumber(
    conn,
    remap: dict[int, int],
    stash_map: dict[int, int],
) -> None:
    header("Applying renumber (inside transaction)")

    fk_constraints = [c for *_, c, has_fk in [(t, c, fk, has_fk) for t, c, fk, has_fk in ITEM_REF_TABLES] if has_fk]
    fks = [(t, fk) for t, _c, fk, has_fk in ITEM_REF_TABLES if has_fk and fk]

    # 1. Drop FKs that target items.id so we can update PK without cascade pain.
    for table, fk_name in fks:
        # Use IF EXISTS in case names differ slightly across deployments.
        await conn.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {fk_name}")
    print(f"  Dropped {len(fks)} FK constraint(s).")

    # 2. Stash inactive items at target IDs to high spare IDs.
    if stash_map:
        for old, new in stash_map.items():
            await conn.execute("UPDATE items SET id = $1 WHERE id = $2", new, old)
            for table, col, *_ in ITEM_REF_TABLES:
                await conn.execute(
                    f"UPDATE {table} SET {col} = $1 WHERE {col} = $2",
                    new, old,
                )
            for table, col in ITEM_REF_AUDIT_TABLES:
                await conn.execute(
                    f"UPDATE {table} SET {col} = $1 WHERE {col} = $2",
                    new, old,
                )
        print(f"  Stashed {len(stash_map)} inactive item(s).")

    # 3. Renumber: source -> target. Update items.id then every dependent table.
    total_updates: dict[str, int] = {}
    for old, new in remap.items():
        await conn.execute("UPDATE items SET id = $1 WHERE id = $2", new, old)
        for table, col, *_ in ITEM_REF_TABLES:
            res = await conn.execute(
                f"UPDATE {table} SET {col} = $1 WHERE {col} = $2",
                new, old,
            )
            # asyncpg execute returns 'UPDATE n'
            n = int(res.split()[-1]) if res.startswith("UPDATE") else 0
            total_updates[table] = total_updates.get(table, 0) + n
        for table, col in ITEM_REF_AUDIT_TABLES:
            res = await conn.execute(
                f"UPDATE {table} SET {col} = $1 WHERE {col} = $2",
                new, old,
            )
            n = int(res.split()[-1]) if res.startswith("UPDATE") else 0
            key = f"{table}.{col}"
            total_updates[key] = total_updates.get(key, 0) + n
        print(f"  Renumbered item {old} -> {new}")

    print("\n  Per-table rows updated:")
    for k, v in total_updates.items():
        print(f"    {k:32} : {v}")

    # 4. Re-create FKs.
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

    remap = parse_remap(args.remap)

    print(f"\n{'='*60}")
    mode = "DRY RUN" if args.dry_run else ("APPLY" if args.apply else "DIAGNOSTIC ONLY")
    print(f"  Item Renumber  [{mode}]")
    print(f"  Mapping: {remap}")
    print(f"  Env: {args.env}")
    print(f"{'='*60}")

    if not args.dry_run and not args.apply:
        print("\n  No --apply or --dry-run flag — running diagnostic only.")
        print("  Re-run with --dry-run to preview the transaction,")
        print("  or --apply to write changes.\n")

    db_url = load_database_url(Path(args.env))
    conn = await asyncpg.connect(db_url)

    try:
        diag = await diagnose(conn, remap)

        if not diag["src_present"]:
            print("\n  Nothing to do — source IDs not present. Exiting.")
            return

        if diag["blockers"]:
            print("\nERROR: target IDs are occupied by ACTIVE items. Aborting.")
            for b in diag["blockers"]:
                print(f"    id={b['id']} name='{b['name']}' is_active=TRUE")
            sys.exit(1)

        stash_ids = [b["id"] for b in diag["stash_needed"]]
        stash_map: dict[int, int] = {}

        if not args.apply and not args.dry_run:
            return  # diagnostic-only mode

        async with conn.transaction():
            if stash_ids:
                stash_map = await stash_inactive(conn, stash_ids, args.stash_offset)
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
        description="Renumber item IDs in items table and cascade through all FK references.",
    )
    parser.add_argument(
        "--remap",
        default=None,
        help='Comma-separated old:new pairs, e.g. "154:22,155:23,156:24". '
             f"Default: {','.join(f'{k}:{v}' for k, v in DEFAULT_REMAP.items())}",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run the full transaction then roll back. Shows what would change.",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Write changes for real. Without this and --dry-run, runs diagnostic only.",
    )
    parser.add_argument(
        "--stash-offset", type=int, default=9000,
        help="Offset added to inactive items at target IDs that need to be moved aside (default 9000).",
    )
    parser.add_argument(
        "--env", default=str(DEFAULT_ENV),
        help=f"Path to .env file with DATABASE_URL (default: {DEFAULT_ENV}).",
    )
    args = parser.parse_args()

    if args.apply and args.dry_run:
        sys.exit("ERROR: choose either --apply or --dry-run, not both.")

    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
