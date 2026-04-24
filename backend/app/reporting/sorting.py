"""
Reusable sorting helpers for report output rows.

All functions accept and return a list[dict].  They do not mutate the input.
Use these consistently so every report presents data in the same order.
"""
from __future__ import annotations

import datetime


def sort_by_date(data: list[dict], date_key: str = "date") -> list[dict]:
    """
    Sort rows ascending by a date field.

    Parameters
    ----------
    data     : List of row dicts.
    date_key : Name of the date field (default: ``"date"``).
    """
    return sorted(data, key=lambda r: r[date_key])


def sort_by_item_id(
    data: list[dict],
    id_key: str = "item_id",
    name_key: str = "item_name",
) -> list[dict]:
    """Sort rows by the item master primary key ascending (the canonical
    business order).

    Rules
    -----
    * Primary: ``item_id`` ascending.
    * Secondary (tie-break / stable output): ``item_name`` ascending —
      only relevant when multiple rows share the same ``item_id``
      (e.g. same item at different rates in the daily-charges report).
    * Rows with a missing/None ``item_id`` are placed at the END, so items
      that are not in the item master (orphans) don't push real items
      down. They're still sorted among themselves by ``item_name``.

    Parameters
    ----------
    data     : List of row dicts.
    id_key   : Name of the item id field (default: ``"item_id"``).
    name_key : Name of the item name field used as tie-break (default:
               ``"item_name"``).
    """
    def key(r: dict):
        iid = r.get(id_key)
        missing = iid is None
        return (
            missing,                       # False (0) < True (1): real items first
            iid if not missing else 0,
            (r.get(name_key) or "").lower(),
        )
    return sorted(data, key=key)


# DEPRECATED — kept only to avoid breaking external callers. Do NOT use in
# new code; use sort_by_item_id. Alphabetical sorting is wrong for business
# reports because it breaks the operator's expected item sequence.
def sort_by_item_name(data: list[dict], name_key: str = "item_name") -> list[dict]:
    return sorted(data, key=lambda r: r[name_key].lower())


def sort_by_departure_then_item(
    data: list[dict],
    departure_key: str = "departure",
    id_key: str = "item_id",
    name_key: str = "item_name",
) -> list[dict]:
    """
    Sort rows by departure time ascending (nulls last), then by the item
    master primary key ascending (the canonical business order used
    everywhere in the system). Item name is a tie-break only.

    Null-departure rows represent walk-in / open-schedule trips and always
    appear after all time-assigned ferry slots.

    Parameters
    ----------
    data          : List of row dicts.
    departure_key : Name of the departure field (default: ``"departure"``).
    id_key        : Name of the item id field (default: ``"item_id"``).
    name_key      : Name of the item name field used as tie-break
                    (default: ``"item_name"``).
    """
    def key(r: dict):
        iid = r.get(id_key)
        missing = iid is None
        return (
            r[departure_key] is None,   # non-null departures first
            r[departure_key] or datetime.time(0, 0),
            missing,                    # real items first, orphans last
            iid if not missing else 0,
            (r.get(name_key) or "").lower(),
        )
    return sorted(data, key=key)


def sort_by_payment_mode(
    data: list[dict],
    mode_key: str = "payment_mode_name",
) -> list[dict]:
    """
    Sort rows alphabetically ascending by payment mode name (case-insensitive).

    Parameters
    ----------
    data     : List of row dicts.
    mode_key : Name of the payment mode field (default: ``"payment_mode_name"``).
    """
    return sorted(data, key=lambda r: r[mode_key].lower())
