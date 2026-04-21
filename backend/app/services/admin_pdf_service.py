"""
PDF generators for the three admin reports.

Layouts are tuned to match the client-provided samples:
    - L_Mar 26 Bhynder.pdf              -> generate_itemwise_levy_pdf
    - Vasai Bhynder Mar 26 Cash & GPay  -> generate_date_branch_summary_pdf
    - Aud_Mar 26 B.pdf                  -> generate_itemwise_daily_charges_pdf

Reuses _fmt_amount from pdf_service to keep Indian-style formatting
consistent across all reports.
"""
from __future__ import annotations

import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.pdf_service import COMPANY_NAME, _fmt_amount


# ── Shared style helpers ──────────────────────────────────────────────────────


def _styles():
    base = getSampleStyleSheet()
    return {
        "Company": ParagraphStyle(
            "AdminCompany",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            alignment=TA_CENTER,
            spaceAfter=1 * mm,
        ),
        "Route": ParagraphStyle(
            "AdminRoute",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=1 * mm,
        ),
        "Title": ParagraphStyle(
            "AdminTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            alignment=TA_CENTER,
            spaceAfter=3 * mm,
        ),
        "SectionHeader": ParagraphStyle(
            "AdminSectionHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            alignment=TA_CENTER,
            spaceBefore=2 * mm,
            spaceAfter=1 * mm,
        ),
        "BranchHeader": ParagraphStyle(
            "AdminBranchHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            alignment=TA_CENTER,
            spaceAfter=1 * mm,
        ),
        "SummaryLabel": ParagraphStyle(
            "AdminSummaryLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            alignment=TA_LEFT,
            spaceBefore=2 * mm,
        ),
    }


def _fmt_date_label(d: datetime.date) -> str:
    return d.strftime("%d/%m/%Y")


def _fmt_date_short(d: datetime.date) -> str:
    return d.strftime("%d-%b-%Y")


def _fmt_date_header(d: datetime.date) -> str:
    """Date header used in Report C (e.g. '1-Mar-26')."""
    return d.strftime("%-d-%b-%y") if hasattr(d, "strftime") else str(d)


def _header_block(data: dict, report_title: str) -> list:
    """Company name, route label, and report title (shared by all three)."""
    styles = _styles()
    title_line = (
        f"{report_title} From : {_fmt_date_label(data['date_from'])} "
        f"To : {_fmt_date_label(data['date_to'])}"
    )
    return [
        Paragraph(COMPANY_NAME, styles["Company"]),
        Paragraph(data["route_label"], styles["Route"]),
        Paragraph(title_line, styles["Title"]),
    ]


def _base_table_style(n_cols: int, n_rows: int, total_row: bool = True) -> TableStyle:
    """Common table look: bordered, alternating rows, bold header/totals."""
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    if total_row and n_rows > 1:
        last = n_rows - 1
        cmds.append(("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"))
        cmds.append(("BACKGROUND", (0, last), (-1, last), colors.HexColor("#e0e0e0")))
    return TableStyle(cmds)


# ── Report A: Itemwise Levy Summary ───────────────────────────────────────────


def generate_itemwise_levy_pdf(data: dict) -> BytesIO:
    """Portrait A4. Columns: Items | Levy | <branch1> | <branch2> | Qty | Amount."""
    styles = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        leftMargin=1 * cm,
        rightMargin=1 * cm,
    )

    elements: list = []
    elements.extend(_header_block(data, "Itemwise Levy Summary"))

    branches = data["branches"]
    header = ["Items", "Levy"] + [b["name"] for b in branches] + ["Quantity", "Amount"]
    body: list[list[str]] = [header]

    for row in data["rows"]:
        line = [
            row["item_name"],
            _fmt_amount(row["levy"]),
        ]
        for b in branches:
            qty = row["branch_quantities"].get(str(b["id"]), 0)
            line.append(f"{qty:,}")
        line.append(f"{row['total_quantity']:,}")
        line.append(_fmt_amount(row["amount"]))
        body.append(line)

    # Total row
    total_line = ["Total"] + [""] * (1 + len(branches)) + ["", _fmt_amount(data["grand_total"])]
    body.append(total_line)

    col_widths = [6.5 * cm, 1.5 * cm] + [2.0 * cm] * len(branches) + [2.0 * cm, 2.5 * cm]
    table = Table(body, colWidths=col_widths, repeatRows=1)
    table.setStyle(_base_table_style(len(header), len(body), total_row=True))
    # Right-align numeric columns (Levy + branch qty + Quantity + Amount)
    numeric_start = 1
    table.setStyle(
        TableStyle(
            [("ALIGN", (numeric_start, 1), (-1, -1), "RIGHT")]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 4 * mm))

    # Summary block: per-branch totals + grand total
    elements.append(Paragraph("Summary :", styles["SummaryLabel"]))
    summary_rows: list[list[str]] = []
    for b in branches:
        summary_rows.append(
            [b["name"], _fmt_amount(data["branch_totals"].get(str(b["id"]), "0.00"))]
        )
    summary_rows.append(["Total Amount", _fmt_amount(data["grand_total"])])
    summary = Table(summary_rows, colWidths=[6 * cm, 4 * cm])
    summary.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    elements.append(summary)

    doc.build(elements)
    buf.seek(0)
    return buf


# ── Report B: Date-Wise Branch Summary ────────────────────────────────────────


def generate_date_branch_summary_pdf(data: dict) -> BytesIO:
    """Landscape A4. Columns: Date | <branch>-<mode> ... | Total."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        leftMargin=1 * cm,
        rightMargin=1 * cm,
    )

    elements: list = []
    elements.extend(
        _header_block(
            data, "Date Wise Branch Summary : Payment Mode - Cash Memo & GPay"
        )
    )

    cols = data["columns"]
    header = ["Date"] + [c["label"] for c in cols] + ["Total"]
    body: list[list[str]] = [header]

    for row in data["rows"]:
        line = [_fmt_date_short(row["date"])]
        for c in cols:
            val = row["cells"].get(c["key"], "0.00")
            line.append(_fmt_amount(val) if float(val or 0) else "")
        line.append(_fmt_amount(row["total"]))
        body.append(line)

    # Total row
    total_line = ["Total"]
    for c in cols:
        total_line.append(_fmt_amount(data["column_totals"].get(c["key"], "0.00")))
    total_line.append(_fmt_amount(data["grand_total"]))
    body.append(total_line)

    col_count = len(header)
    # Date col ~2.5cm, mode cols evenly distributed, total col 2.5cm
    mode_col_width = (26 - 5) / max(1, col_count - 2) * cm
    col_widths = [2.5 * cm] + [mode_col_width] * (col_count - 2) + [2.5 * cm]

    table = Table(body, colWidths=col_widths, repeatRows=1)
    table.setStyle(_base_table_style(col_count, len(body), total_row=True))
    table.setStyle(TableStyle([("ALIGN", (1, 1), (-1, -1), "RIGHT")]))
    elements.append(table)

    doc.build(elements)
    buf.seek(0)
    return buf


# ── Report C: Itemwise Daily Collection Charges Summary ───────────────────────


def generate_itemwise_daily_charges_pdf(data: dict) -> BytesIO:
    """Portrait A4. One section per date with per-branch sub-tables."""
    styles = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        leftMargin=1 * cm,
        rightMargin=1 * cm,
    )

    elements: list = []
    elements.extend(
        _header_block(data, "Itemwise Daily Collection Charges Summary")
    )

    date_sections = data["dates"]
    last_idx = len(date_sections) - 1

    for idx, ds in enumerate(date_sections):
        elements.append(
            Paragraph(ds["date"].strftime("%d-%b-%Y"), styles["SectionHeader"])
        )
        for bs in ds["branches"]:
            elements.append(Paragraph(bs["branch_name"], styles["BranchHeader"]))
            header = ["ItemCategoryName", "Charges", "Quantity", "Amount"]
            body: list[list[str]] = [header]
            for r in bs["rows"]:
                body.append(
                    [
                        r["item_name"],
                        _fmt_amount(r["charges"]),
                        f"{r['quantity']:,}",
                        _fmt_amount(r["amount"]),
                    ]
                )
            body.append([bs["branch_name"], "", "", _fmt_amount(bs["subtotal"])])

            col_widths = [9.5 * cm, 2.5 * cm, 2.5 * cm, 3.0 * cm]
            table = Table(body, colWidths=col_widths, repeatRows=1)
            table.setStyle(_base_table_style(4, len(body), total_row=True))
            table.setStyle(TableStyle([("ALIGN", (1, 1), (-1, -1), "RIGHT")]))
            elements.append(table)
            elements.append(Spacer(1, 2 * mm))

        day_total_tbl = Table(
            [[f"Total for {data['route_label']}", _fmt_amount(ds["day_total"])]],
            colWidths=[14 * cm, 3.5 * cm],
        )
        day_total_tbl.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("LINEABOVE", (0, 0), (-1, 0), 0.6, colors.black),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
                    ("TOPPADDING", (0, 0), (-1, 0), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
                ]
            )
        )
        elements.append(day_total_tbl)

        if idx != last_idx:
            elements.append(PageBreak())
            # Repeat header block on every page (matches client PDF)
            elements.extend(_header_block(data, "Itemwise Daily Collection Charges Summary"))

    # Final grand total at the end
    if date_sections:
        elements.append(Spacer(1, 4 * mm))
        grand_tbl = Table(
            [["Grand Total", _fmt_amount(data["grand_total"])]],
            colWidths=[14 * cm, 3.5 * cm],
        )
        grand_tbl.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("LINEABOVE", (0, 0), (-1, 0), 1.0, colors.black),
                    ("LINEBELOW", (0, 0), (-1, 0), 1.0, colors.black),
                    ("TOPPADDING", (0, 0), (-1, 0), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
                ]
            )
        )
        elements.append(grand_tbl)

    doc.build(elements)
    buf.seek(0)
    return buf
