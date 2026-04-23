"""
Excel (xlsx) generators for the three admin reports.

Uses openpyxl. Each generator returns a BytesIO ready to stream.

The layouts mirror the PDFs but expose numbers as real numeric cells
(not formatted strings) so downstream spreadsheet users can pivot/sum
without reparsing.
"""
from __future__ import annotations

import datetime
from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.services.pdf_service import COMPANY_NAME

# ── Shared styling ────────────────────────────────────────────────────────────

_BOLD = Font(bold=True)
_CENTER = Alignment(horizontal="center", vertical="center")
_RIGHT = Alignment(horizontal="right")
_HEADER_FILL = PatternFill("solid", fgColor="333333")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_TOTAL_FILL = PatternFill("solid", fgColor="E0E0E0")
_THIN = Side(border_style="thin", color="999999")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)

_MONEY_FMT = "#,##0.00"


def _to_number(val) -> float:
    """Convert a string like '42768.00' or a Decimal into float for the cell."""
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, Decimal):
        return float(val)
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return 0.0


def _write_header_rows(ws: Worksheet, title: str, data: dict, col_span: int) -> int:
    """Write company/route/title rows. Returns the next row number to use."""
    ws.cell(row=1, column=1, value=COMPANY_NAME).font = _BOLD
    ws.merge_cells(start_row=1, end_row=1, start_column=1, end_column=col_span)
    ws.cell(row=1, column=1).alignment = _CENTER

    ws.cell(row=2, column=1, value=data["route_label"]).font = _BOLD
    ws.merge_cells(start_row=2, end_row=2, start_column=1, end_column=col_span)
    ws.cell(row=2, column=1).alignment = _CENTER

    dfrom = data["date_from"]
    dto = data["date_to"]
    subtitle = (
        f"{title} From : {dfrom:%d/%m/%Y} To : {dto:%d/%m/%Y}"
        if isinstance(dfrom, datetime.date)
        else f"{title} From : {dfrom} To : {dto}"
    )
    ws.cell(row=3, column=1, value=subtitle).font = Font(italic=True)
    ws.merge_cells(start_row=3, end_row=3, start_column=1, end_column=col_span)
    ws.cell(row=3, column=1).alignment = _CENTER

    return 5  # leave row 4 empty as spacer


def _style_header_row(ws: Worksheet, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = _CENTER
        cell.border = _BORDER


def _style_total_row(ws: Worksheet, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = _TOTAL_FILL
        cell.font = _BOLD
        cell.border = _BORDER


def _autosize(ws: Worksheet, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ── Report A: Itemwise Levy Summary ───────────────────────────────────────────


def generate_itemwise_levy_xlsx(data: dict) -> BytesIO:
    """Columns: Items | Levy | <branch1> | <branch2> | Quantity | Amount."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Itemwise Levy Summary"

    branches = data["branches"]
    col_span = 4 + len(branches)  # Items, Levy, branches..., Qty, Amount

    next_row = _write_header_rows(ws, "Itemwise Levy Summary", data, col_span)

    # Column headers
    header = ["Items", "Levy"] + [b["name"] for b in branches] + ["Quantity", "Amount"]
    for i, h in enumerate(header, start=1):
        ws.cell(row=next_row, column=i, value=h)
    _style_header_row(ws, next_row, col_span)
    header_row = next_row
    next_row += 1

    # Data rows
    for row in data["rows"]:
        ws.cell(row=next_row, column=1, value=row["item_name"])
        ws.cell(row=next_row, column=2, value=_to_number(row["levy"])).number_format = _MONEY_FMT
        for j, b in enumerate(branches, start=3):
            ws.cell(
                row=next_row,
                column=j,
                value=int(row["branch_quantities"].get(str(b["id"]), 0)),
            )
        ws.cell(row=next_row, column=3 + len(branches), value=int(row["total_quantity"]))
        ws.cell(
            row=next_row,
            column=4 + len(branches),
            value=_to_number(row["amount"]),
        ).number_format = _MONEY_FMT
        # Right-align numeric cells
        for c in range(2, col_span + 1):
            ws.cell(row=next_row, column=c).alignment = _RIGHT
        next_row += 1

    # Total row
    ws.cell(row=next_row, column=1, value="Total")
    ws.cell(
        row=next_row,
        column=col_span,
        value=_to_number(data["grand_total"]),
    ).number_format = _MONEY_FMT
    ws.cell(row=next_row, column=col_span).alignment = _RIGHT
    _style_total_row(ws, next_row, col_span)
    next_row += 2

    # Summary block
    ws.cell(row=next_row, column=1, value="Summary").font = _BOLD
    next_row += 1
    for b in branches:
        ws.cell(row=next_row, column=1, value=b["name"]).font = _BOLD
        ws.cell(
            row=next_row,
            column=2,
            value=_to_number(data["branch_totals"].get(str(b["id"]), "0")),
        ).number_format = _MONEY_FMT
        ws.cell(row=next_row, column=2).alignment = _RIGHT
        next_row += 1
    ws.cell(row=next_row, column=1, value="Total Amount").font = _BOLD
    ws.cell(
        row=next_row,
        column=2,
        value=_to_number(data["grand_total"]),
    ).number_format = _MONEY_FMT
    ws.cell(row=next_row, column=2).font = _BOLD
    ws.cell(row=next_row, column=2).alignment = _RIGHT

    # Freeze header
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1).coordinate

    # Column widths
    _autosize(ws, [30, 10] + [14] * len(branches) + [12, 14])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── Report B: Date-Wise Branch Summary ────────────────────────────────────────


def generate_date_branch_summary_xlsx(data: dict) -> BytesIO:
    """Columns: Date | <branch>-<mode> … | Total."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Date-Wise Branch Summary"

    cols = data["columns"]
    col_span = 2 + len(cols)  # Date + mode cols + Total

    next_row = _write_header_rows(
        ws, "Date Wise Branch Summary (Cash + GPay)", data, col_span
    )

    header = ["Date"] + [c["label"] for c in cols] + ["Total"]
    for i, h in enumerate(header, start=1):
        ws.cell(row=next_row, column=i, value=h)
    _style_header_row(ws, next_row, col_span)
    header_row = next_row
    next_row += 1

    for row in data["rows"]:
        d = row["date"]
        ws.cell(row=next_row, column=1, value=d if isinstance(d, datetime.date) else str(d))
        if isinstance(d, datetime.date):
            ws.cell(row=next_row, column=1).number_format = "dd-mmm-yyyy"
        for j, c in enumerate(cols, start=2):
            val = _to_number(row["cells"].get(c["key"], "0"))
            cell = ws.cell(row=next_row, column=j, value=val if val else None)
            cell.number_format = _MONEY_FMT
            cell.alignment = _RIGHT
        ws.cell(
            row=next_row,
            column=col_span,
            value=_to_number(row["total"]),
        ).number_format = _MONEY_FMT
        ws.cell(row=next_row, column=col_span).alignment = _RIGHT
        next_row += 1

    # Total row
    ws.cell(row=next_row, column=1, value="Total")
    for j, c in enumerate(cols, start=2):
        cell = ws.cell(
            row=next_row,
            column=j,
            value=_to_number(data["column_totals"].get(c["key"], "0")),
        )
        cell.number_format = _MONEY_FMT
        cell.alignment = _RIGHT
    ws.cell(
        row=next_row,
        column=col_span,
        value=_to_number(data["grand_total"]),
    ).number_format = _MONEY_FMT
    ws.cell(row=next_row, column=col_span).alignment = _RIGHT
    _style_total_row(ws, next_row, col_span)

    ws.freeze_panes = ws.cell(row=header_row + 1, column=2).coordinate
    _autosize(ws, [14] + [16] * len(cols) + [14])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── Report C: Itemwise Daily Collection Charges ───────────────────────────────


def generate_itemwise_daily_charges_xlsx(data: dict) -> BytesIO:
    """One worksheet per date is overkill; instead use a single flat sheet
    with date/branch as grouping columns so it's spreadsheet-native.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Charges"

    col_span = 6  # Date | Branch | Item | Charges | Quantity | Amount
    next_row = _write_header_rows(
        ws, "Itemwise Daily Collection Charges Summary", data, col_span
    )

    header = ["Date", "Branch", "Item", "Charges", "Quantity", "Amount"]
    for i, h in enumerate(header, start=1):
        ws.cell(row=next_row, column=i, value=h)
    _style_header_row(ws, next_row, col_span)
    header_row = next_row
    next_row += 1

    for ds in data["dates"]:
        d = ds["date"]
        for bs in ds["branches"]:
            for r in bs["rows"]:
                ws.cell(row=next_row, column=1, value=d if isinstance(d, datetime.date) else str(d))
                if isinstance(d, datetime.date):
                    ws.cell(row=next_row, column=1).number_format = "dd-mmm-yyyy"
                ws.cell(row=next_row, column=2, value=bs["branch_name"])
                ws.cell(row=next_row, column=3, value=r["item_name"])
                ws.cell(
                    row=next_row, column=4, value=_to_number(r["charges"])
                ).number_format = _MONEY_FMT
                ws.cell(row=next_row, column=5, value=int(r["quantity"]))
                ws.cell(
                    row=next_row, column=6, value=_to_number(r["amount"])
                ).number_format = _MONEY_FMT
                for c in (4, 5, 6):
                    ws.cell(row=next_row, column=c).alignment = _RIGHT
                next_row += 1
            # Branch subtotal line
            ws.cell(row=next_row, column=2, value=f"{bs['branch_name']} subtotal").font = _BOLD
            ws.cell(
                row=next_row, column=6, value=_to_number(bs["subtotal"])
            ).number_format = _MONEY_FMT
            ws.cell(row=next_row, column=6).alignment = _RIGHT
            _style_total_row(ws, next_row, col_span)
            next_row += 1
        # Day total
        ws.cell(row=next_row, column=1, value=f"Total for {d:%d-%b-%Y}").font = _BOLD
        ws.cell(
            row=next_row, column=6, value=_to_number(ds["day_total"])
        ).number_format = _MONEY_FMT
        ws.cell(row=next_row, column=6).alignment = _RIGHT
        _style_total_row(ws, next_row, col_span)
        next_row += 2

    # Grand total
    ws.cell(row=next_row, column=1, value="Grand Total").font = _BOLD
    ws.cell(
        row=next_row, column=6, value=_to_number(data["grand_total"])
    ).number_format = _MONEY_FMT
    ws.cell(row=next_row, column=6).alignment = _RIGHT
    _style_total_row(ws, next_row, col_span)

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1).coordinate
    _autosize(ws, [14, 20, 34, 12, 12, 14])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
