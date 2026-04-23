"""
PDF generators for the three admin reports.

Presentation overhaul: clean typographic hierarchy (company > route > title
> subtitle), right-aligned numbers with Indian-style grouping and a Rupee
prefix, zebra striping, minimal borders, and distinct total rows.

Data contracts, calculations, and totals are unchanged from the reporting
modules. This module only controls visual presentation.
"""
from __future__ import annotations

import datetime
import os
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.pdf_service import COMPANY_NAME, _fmt_amount

# ── Font registration (Unicode-capable so ₹ renders) ─────────────────────────
#
# Helvetica (reportlab built-in) uses WinAnsi encoding and cannot render U+20B9.
# We try DejaVu Sans (standard on Debian/Ubuntu base images) first, then Arial
# (Windows). If both fail, the Rupee sign is swapped for "Rs.".

_CANDIDATE_FONTS = [
    # (regular_path, bold_path)
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]

FONT_BODY = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
_UNICODE_READY = False

for reg_path, bold_path in _CANDIDATE_FONTS:
    if os.path.exists(reg_path) and os.path.exists(bold_path):
        try:
            pdfmetrics.registerFont(TTFont("AdminReportBody", reg_path))
            pdfmetrics.registerFont(TTFont("AdminReportBold", bold_path))
            FONT_BODY = "AdminReportBody"
            FONT_BOLD = "AdminReportBold"
            _UNICODE_READY = True
            break
        except Exception:
            continue

RUPEE = "₹" if _UNICODE_READY else "Rs. "


# ── Palette ──────────────────────────────────────────────────────────────────

_COLOR_HEADER_BG = colors.HexColor("#1F3A5F")      # deep navy
_COLOR_HEADER_FG = colors.white
_COLOR_STRIPE = colors.HexColor("#F7F9FC")          # very light blue-grey
_COLOR_TOTAL_BG = colors.HexColor("#E8ECF3")
_COLOR_RULE = colors.HexColor("#C8CED9")
_COLOR_RULE_DARK = colors.HexColor("#3A4A63")
_COLOR_TEXT = colors.HexColor("#1F2A3A")
_COLOR_MUTED = colors.HexColor("#6B7280")


# ── Formatting helpers ───────────────────────────────────────────────────────


def fmt_currency(val) -> str:
    """Indian-format currency with Rupee prefix (e.g. ₹1,92,749.00)."""
    return f"{RUPEE}{_fmt_amount(val)}"


def fmt_int(val) -> str:
    """Integer with Indian-style grouping (e.g. 1,92,749)."""
    return _fmt_amount(val).rsplit(".", 1)[0]


def fmt_rate(val) -> str:
    """Rate/levy with 2dp and Rupee prefix (e.g. ₹6.00)."""
    return f"{RUPEE}{_fmt_amount(val)}"


def _fmt_date_dmy(d: datetime.date) -> str:
    return d.strftime("%d/%m/%Y") if isinstance(d, datetime.date) else str(d)


def _fmt_date_long(d: datetime.date) -> str:
    return d.strftime("%d %b %Y") if isinstance(d, datetime.date) else str(d)


# ── Cell-wrapping helpers ────────────────────────────────────────────────────
#
# Plain strings in a reportlab Table cell render as a single line and overflow
# into the next column if they exceed the cell width. Long item names (>30
# chars) must therefore be wrapped in Paragraph objects so the text breaks
# inside the cell and the row grows vertically without corrupting alignment.


def _cell_text_style() -> ParagraphStyle:
    return ParagraphStyle(
        "AdminCellText",
        fontName=FONT_BODY,
        fontSize=9,
        leading=11,
        textColor=_COLOR_TEXT,
        alignment=TA_LEFT,
        wordWrap="CJK",  # character-wrap fallback for tokens with no spaces
    )


def _cell_num_style() -> ParagraphStyle:
    return ParagraphStyle(
        "AdminCellNum",
        fontName=FONT_BODY,
        fontSize=9,
        leading=11,
        textColor=_COLOR_TEXT,
        alignment=TA_RIGHT,
    )


def _wrap_text(value: str) -> Paragraph:
    return Paragraph(value or "", _cell_text_style())


def _wrap_num(value: str) -> Paragraph:
    return Paragraph(value or "", _cell_num_style())


# ── Styles ───────────────────────────────────────────────────────────────────


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "Company": ParagraphStyle(
            "AdminCompany",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=14,
            leading=18,
            textColor=_COLOR_TEXT,
            alignment=TA_CENTER,
            spaceAfter=1 * mm,
        ),
        "Route": ParagraphStyle(
            "AdminRoute",
            parent=base["Normal"],
            fontName=FONT_BODY,
            fontSize=10,
            leading=13,
            textColor=_COLOR_MUTED,
            alignment=TA_CENTER,
            spaceAfter=4 * mm,
        ),
        "Title": ParagraphStyle(
            "AdminTitle",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=12,
            leading=15,
            textColor=_COLOR_TEXT,
            alignment=TA_CENTER,
            spaceAfter=1 * mm,
        ),
        "Subtitle": ParagraphStyle(
            "AdminSubtitle",
            parent=base["Normal"],
            fontName=FONT_BODY,
            fontSize=9,
            leading=12,
            textColor=_COLOR_MUTED,
            alignment=TA_CENTER,
            spaceAfter=2 * mm,
        ),
        "DateBand": ParagraphStyle(
            "AdminDateBand",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=11,
            leading=14,
            textColor=_COLOR_TEXT,
            alignment=TA_LEFT,
            spaceBefore=3 * mm,
            spaceAfter=1 * mm,
        ),
        "BranchLabel": ParagraphStyle(
            "AdminBranchLabel",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=10,
            leading=13,
            textColor=_COLOR_TEXT,
            alignment=TA_LEFT,
            spaceBefore=1 * mm,
            spaceAfter=1 * mm,
        ),
        "SectionHeader": ParagraphStyle(
            "AdminSectionHeader",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=11,
            leading=14,
            textColor=_COLOR_TEXT,
            alignment=TA_LEFT,
            spaceBefore=4 * mm,
            spaceAfter=2 * mm,
        ),
    }


def _header_block(data: dict, report_title: str) -> list:
    """Shared header: company → route → title → date range."""
    s = _styles()
    subtitle = (
        f"Period: {_fmt_date_dmy(data['date_from'])} to {_fmt_date_dmy(data['date_to'])}"
    )
    return [
        Paragraph(COMPANY_NAME, s["Company"]),
        Paragraph(data["route_label"], s["Route"]),
        Paragraph(report_title, s["Title"]),
        Paragraph(subtitle, s["Subtitle"]),
    ]


def _thin_separator(width: float = 17 * cm) -> Table:
    t = Table([[""]], colWidths=[width], rowHeights=[0.1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, _COLOR_RULE)]))
    return t


def _build_doc(buf: BytesIO, landscape_mode: bool = False) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=landscape(A4) if landscape_mode else A4,
        topMargin=1.4 * cm,
        bottomMargin=1.4 * cm,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        title="Admin Report",
        author="SSMSPL",
    )


def _base_table_style(
    n_cols: int,
    n_rows: int,
    right_align_from: int,
    has_total_row: bool,
    col_stripes: bool = True,
) -> TableStyle:
    """Common look: navy header, zebra body, distinct total row."""
    cmds = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), _COLOR_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), _COLOR_HEADER_FG),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        # Body — TOP valign so numeric cells sit alongside the first line
        # of a wrapped item name instead of drifting to the vertical centre
        # of a tall row.
        ("FONTNAME", (0, 1), (-1, -1), FONT_BODY),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), _COLOR_TEXT),
        ("VALIGN", (0, 1), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        # Alignment: text left, numeric columns right
        ("ALIGN", (0, 1), (right_align_from - 1, -1), "LEFT"),
        ("ALIGN", (right_align_from, 1), (-1, -1), "RIGHT"),
        # Minimal borders: only a soft horizontal rule below the header
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _COLOR_RULE_DARK),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, _COLOR_RULE),
    ]

    if col_stripes and n_rows > 1:
        cmds.append(
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _COLOR_STRIPE])
        )

    if has_total_row and n_rows > 1:
        last = n_rows - 1
        cmds.append(("BACKGROUND", (0, last), (-1, last), _COLOR_TOTAL_BG))
        cmds.append(("FONTNAME", (0, last), (-1, last), FONT_BOLD))
        cmds.append(("FONTSIZE", (0, last), (-1, last), 10))
        cmds.append(("LINEABOVE", (0, last), (-1, last), 1.0, _COLOR_RULE_DARK))
        cmds.append(("TOPPADDING", (0, last), (-1, last), 6))
        cmds.append(("BOTTOMPADDING", (0, last), (-1, last), 6))

    return TableStyle(cmds)


# ── Report A: Itemwise Levy Summary ──────────────────────────────────────────


def generate_itemwise_levy_pdf(data: dict) -> BytesIO:
    """Portrait A4. Columns: Item | Levy | <branch1> | … | Qty | Amount."""
    buf = BytesIO()
    doc = _build_doc(buf, landscape_mode=False)
    elements: list = _header_block(data, "Itemwise Levy Summary")

    branches = data["branches"]
    headers = ["Item"] + ["Levy"] + [b["name"] for b in branches] + ["Quantity", "Amount"]
    body: list = [headers]

    # Only the Item column needs wrapping (names up to ~43 chars). Numeric
    # columns stay as plain strings so TableStyle can control their font.
    for row in data["rows"]:
        line: list = [
            _wrap_text(row["item_name"]),
            fmt_rate(row["levy"]),
        ]
        for b in branches:
            qty = row["branch_quantities"].get(str(b["id"]), 0)
            line.append(fmt_int(qty))
        line.append(fmt_int(row["total_quantity"]))
        line.append(fmt_currency(row["amount"]))
        body.append(line)

    total_line: list = (
        ["Total"]
        + [""] * (1 + len(branches) + 1)
        + [fmt_currency(data["grand_total"])]
    )
    body.append(total_line)

    # Column widths calibrated to A4 portrait (usable ≈17.6cm).
    # Give Item extra room — most cluttered column, has 40-char names.
    item_w_cm = 6.8
    levy_w_cm = 1.5
    branch_w_cm = 1.9
    qty_w_cm = 1.9
    used_cm = item_w_cm + levy_w_cm + branch_w_cm * len(branches) + qty_w_cm
    amount_w_cm = max(3.2, 17.6 - used_cm)
    col_widths = (
        [item_w_cm * cm, levy_w_cm * cm]
        + [branch_w_cm * cm] * len(branches)
        + [qty_w_cm * cm, amount_w_cm * cm]
    )

    tbl = Table(body, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        _base_table_style(
            n_cols=len(headers),
            n_rows=len(body),
            right_align_from=1,     # everything except the Item column is right-aligned
            has_total_row=True,
        )
    )
    elements.append(tbl)
    elements.append(Spacer(1, 8 * mm))

    # Summary block — clean two-column ledger
    s = _styles()
    elements.append(Paragraph("Summary", s["SectionHeader"]))

    summary_rows: list[list[str]] = []
    for b in branches:
        summary_rows.append(
            [b["name"], fmt_currency(data["branch_totals"].get(str(b["id"]), "0"))]
        )
    summary_rows.append(["Grand Total", fmt_currency(data["grand_total"])])

    summary = Table(summary_rows, colWidths=[7 * cm, 4.5 * cm], hAlign="RIGHT")
    summary.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -2), FONT_BODY),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (-1, -1), _COLOR_TEXT),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                # Grand Total row
                ("FONTNAME", (0, -1), (-1, -1), FONT_BOLD),
                ("FONTSIZE", (0, -1), (-1, -1), 11),
                ("LINEABOVE", (0, -1), (-1, -1), 1.0, _COLOR_RULE_DARK),
                ("LINEBELOW", (0, -1), (-1, -1), 0.5, _COLOR_RULE_DARK),
                ("TOPPADDING", (0, -1), (-1, -1), 7),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
            ]
        )
    )
    elements.append(summary)

    doc.build(elements)
    buf.seek(0)
    return buf


# ── Report B: Date-Wise Branch Summary ───────────────────────────────────────


def generate_date_branch_summary_pdf(data: dict) -> BytesIO:
    """Landscape A4. Columns: Date | <branch>-<mode> … | Total."""
    buf = BytesIO()
    doc = _build_doc(buf, landscape_mode=True)
    elements: list = _header_block(
        data, "Date-Wise Branch Summary  —  Cash & GPay"
    )

    cols = data["columns"]
    headers = ["Date"] + [c["label"] for c in cols] + ["Total"]
    body: list[list[str]] = [headers]

    for row in data["rows"]:
        line = [_fmt_date_long(row["date"])]
        for c in cols:
            raw = row["cells"].get(c["key"], "0.00")
            # Only render a value when > 0 so empty cells stay visually quiet
            line.append(fmt_currency(raw) if float(raw or 0) else "—")
        line.append(fmt_currency(row["total"]))
        body.append(line)

    total_line = ["Total"]
    for c in cols:
        total_line.append(fmt_currency(data["column_totals"].get(c["key"], "0")))
    total_line.append(fmt_currency(data["grand_total"]))
    body.append(total_line)

    # Landscape A4 usable width ≈25.7cm
    date_w = 2.8 * cm
    total_w = 2.8 * cm
    remaining = 25.7 - (date_w / cm + total_w / cm)
    mode_w = max(2.2, remaining / max(1, len(cols))) * cm
    col_widths = [date_w] + [mode_w] * len(cols) + [total_w]

    tbl = Table(body, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        _base_table_style(
            n_cols=len(headers),
            n_rows=len(body),
            right_align_from=1,
            has_total_row=True,
        )
    )
    # Em-dash cells should still align right with the column
    elements.append(tbl)

    doc.build(elements)
    buf.seek(0)
    return buf


# ── Report C: Itemwise Daily Collection Charges Summary ──────────────────────


def generate_itemwise_daily_charges_pdf(data: dict) -> BytesIO:
    """Portrait A4. One block per date with per-branch sub-tables."""
    buf = BytesIO()
    doc = _build_doc(buf, landscape_mode=False)
    s = _styles()

    elements: list = _header_block(
        data, "Itemwise Daily Collection Charges Summary"
    )

    date_sections = data["dates"]
    last_idx = len(date_sections) - 1

    for idx, ds in enumerate(date_sections):
        block: list = []
        block.append(Paragraph(_fmt_date_long(ds["date"]), s["DateBand"]))

        for bs in ds["branches"]:
            block.append(Paragraph(bs["branch_name"], s["BranchLabel"]))
            headers = ["Item", "Charges", "Quantity", "Amount"]
            rows: list = [headers]
            for r in bs["rows"]:
                rows.append(
                    [
                        _wrap_text(r["item_name"]),   # wraps gracefully
                        fmt_rate(r["charges"]),
                        fmt_int(r["quantity"]),
                        fmt_currency(r["amount"]),
                    ]
                )
            # Branch subtotal row
            rows.append(["Subtotal", "", "", fmt_currency(bs["subtotal"])])

            col_widths = [9.2 * cm, 2.6 * cm, 2.4 * cm, 3.2 * cm]
            tbl = Table(rows, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(
                _base_table_style(
                    n_cols=4,
                    n_rows=len(rows),
                    right_align_from=1,
                    has_total_row=True,
                )
            )
            block.append(tbl)
            block.append(Spacer(1, 2 * mm))

        # Day total strip
        day_total = Table(
            [[f"Total for {_fmt_date_long(ds['date'])}", fmt_currency(ds["day_total"])]],
            colWidths=[13.6 * cm, 4.0 * cm],
        )
        day_total.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("TEXTCOLOR", (0, 0), (-1, 0), _COLOR_TEXT),
                    ("BACKGROUND", (0, 0), (-1, 0), _COLOR_TOTAL_BG),
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("LINEABOVE", (0, 0), (-1, 0), 1.0, _COLOR_RULE_DARK),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, _COLOR_RULE_DARK),
                    ("TOPPADDING", (0, 0), (-1, 0), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
                    ("LEFTPADDING", (0, 0), (-1, 0), 6),
                    ("RIGHTPADDING", (0, 0), (-1, 0), 6),
                ]
            )
        )
        block.append(day_total)
        elements.append(KeepTogether(block))

        if idx != last_idx:
            elements.append(PageBreak())
            # Repeat the report header on each new page for a clean stitch
            elements.extend(_header_block(data, "Itemwise Daily Collection Charges Summary"))

    # Grand total
    if date_sections:
        elements.append(Spacer(1, 6 * mm))
        grand = Table(
            [["GRAND TOTAL", fmt_currency(data["grand_total"])]],
            colWidths=[13.6 * cm, 4.0 * cm],
        )
        grand.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                    ("FONTSIZE", (0, 0), (-1, 0), 12),
                    ("TEXTCOLOR", (0, 0), (0, 0), _COLOR_TEXT),
                    ("TEXTCOLOR", (1, 0), (1, 0), _COLOR_TEXT),
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("LINEABOVE", (0, 0), (-1, 0), 1.5, _COLOR_RULE_DARK),
                    ("LINEBELOW", (0, 0), (-1, 0), 1.5, _COLOR_RULE_DARK),
                    ("TOPPADDING", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 9),
                    ("LEFTPADDING", (0, 0), (-1, 0), 6),
                    ("RIGHTPADDING", (0, 0), (-1, 0), 6),
                ]
            )
        )
        elements.append(grand)

    doc.build(elements)
    buf.seek(0)
    return buf
