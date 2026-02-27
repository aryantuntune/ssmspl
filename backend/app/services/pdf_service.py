"""
PDF generation service for report exports.

Uses ReportLab to produce A4 (or landscape) PDFs that match the legacy
system's format: company header, report title, filter subtitle, data table
with alternating row colours, and a bold totals row.
"""

from io import BytesIO
from decimal import Decimal
import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

COMPANY_NAME = "SUVARNADURGA SHIPPING & MARINE SERVICES PVT. LTD."


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _fmt_amount(val) -> str:
    """Format a numeric value as a string with two decimal places and commas.

    Uses Indian numbering format: e.g. 1,31,572.00
    """
    if val is None:
        return "0.00"
    num = float(val)
    is_negative = num < 0
    num = abs(num)

    # Split into integer and decimal parts
    int_part = int(num)
    dec_part = f"{num - int_part:.2f}"[1:]  # ".XX"

    # Indian grouping: last 3 digits, then groups of 2
    s = str(int_part)
    if len(s) <= 3:
        formatted = s
    else:
        # Last 3 digits
        last3 = s[-3:]
        remaining = s[:-3]
        # Group remaining digits in pairs from the right
        groups = []
        while remaining:
            groups.append(remaining[-2:])
            remaining = remaining[:-2]
        groups.reverse()
        formatted = ",".join(groups) + "," + last3

    result = formatted + dec_part
    if is_negative:
        result = "-" + result
    return result


def _fmt_date(val) -> str:
    """Format a date as DD-MMM-YYYY (e.g. 21-Feb-2026)."""
    if val is None:
        return ""
    if isinstance(val, str):
        try:
            val = datetime.date.fromisoformat(val)
        except (ValueError, TypeError):
            return str(val)
    return val.strftime("%d-%b-%Y")


# ---------------------------------------------------------------------------
# Style definitions
# ---------------------------------------------------------------------------

def _get_styles():
    """Return a stylesheet dict with custom styles for PDF reports."""
    base = getSampleStyleSheet()
    styles = {
        "Normal": base["Normal"],
    }
    styles["CompanyHeader"] = ParagraphStyle(
        "CompanyHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        alignment=TA_CENTER,
        spaceAfter=2 * mm,
    )
    styles["ReportTitle"] = ParagraphStyle(
        "ReportTitle",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        alignment=TA_CENTER,
        spaceAfter=2 * mm,
    )
    styles["Subtitle"] = ParagraphStyle(
        "Subtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9,
        alignment=TA_CENTER,
        spaceAfter=2 * mm,
    )
    return styles


# ---------------------------------------------------------------------------
# Core PDF builder
# ---------------------------------------------------------------------------

def _build_pdf(
    title: str,
    subtitle: str | None,
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float] | None = None,
    landscape_mode: bool = False,
) -> BytesIO:
    """Build a PDF document with company header, title, subtitle and data table.

    Parameters
    ----------
    title : str
        The report title displayed below the company name.
    subtitle : str | None
        Filter description (date range, branch, etc.).
    headers : list[str]
        Column header labels.
    rows : list[list[str]]
        Table body rows. The last row is assumed to be a totals row and is
        rendered in bold.
    col_widths : list[float] | None
        Optional explicit column widths.
    landscape_mode : bool
        Use landscape A4 when True.

    Returns
    -------
    BytesIO
        Seeked-to-zero buffer containing the PDF bytes.
    """
    buf = BytesIO()
    pagesize = landscape(A4) if landscape_mode else A4
    doc = SimpleDocTemplate(
        buf,
        pagesize=pagesize,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        leftMargin=1 * cm,
        rightMargin=1 * cm,
    )
    styles = _get_styles()

    elements: list = []
    elements.append(Paragraph(COMPANY_NAME, styles["CompanyHeader"]))
    elements.append(Paragraph(title, styles["ReportTitle"]))
    if subtitle:
        elements.append(Paragraph(subtitle, styles["Subtitle"]))
    elements.append(Spacer(1, 4 * mm))

    table_data = [headers] + rows
    table = Table(table_data, colWidths=col_widths, repeatRows=1)

    # Base style
    style_commands = [
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        # Body rows
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        # Alignment
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        # Alternating row backgrounds (skip totals row)
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        # Padding
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    # Bold the last row (totals) when there are data rows
    if len(rows) > 0:
        last_row_idx = len(table_data) - 1
        style_commands.append(("FONTNAME", (0, last_row_idx), (-1, last_row_idx), "Helvetica-Bold"))
        style_commands.append(("BACKGROUND", (0, last_row_idx), (-1, last_row_idx), colors.HexColor("#e0e0e0")))

    table.setStyle(TableStyle(style_commands))
    elements.append(table)

    doc.build(elements)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# Subtitle helpers
# ---------------------------------------------------------------------------

def _date_range_subtitle(data: dict, extra_parts: list[str] | None = None) -> str:
    """Build a subtitle from date_from/date_to and optional extra filters."""
    parts: list[str] = []
    date_from = data.get("date_from")
    date_to = data.get("date_to")
    if date_from and date_to:
        parts.append(f"From Date: {_fmt_date(date_from)} To {_fmt_date(date_to)}")
    elif date_from:
        parts.append(f"From Date: {_fmt_date(date_from)}")

    if extra_parts:
        parts.extend(extra_parts)

    return "  |  ".join(parts) if parts else ""


def _single_date_subtitle(data: dict, date_key: str = "report_date", extra_parts: list[str] | None = None) -> str:
    """Build a subtitle from a single date field and optional extra filters."""
    parts: list[str] = []
    d = data.get(date_key)
    if d:
        parts.append(f"For Date: {_fmt_date(d)}")
    if extra_parts:
        parts.extend(extra_parts)
    return "  |  ".join(parts) if parts else ""


def _optional_filter_parts(data: dict) -> list[str]:
    """Extract common optional filter labels from data dict."""
    parts: list[str] = []
    if data.get("branch_name"):
        parts.append(f"Branch: {data['branch_name']}")
    if data.get("route_name"):
        parts.append(f"Route: {data['route_name']}")
    if data.get("payment_mode_name"):
        parts.append(f"Payment Mode: {data['payment_mode_name']}")
    return parts


# ---------------------------------------------------------------------------
# 1. Date Wise Amount Summary
# ---------------------------------------------------------------------------

def generate_date_wise_amount_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Date Wise Amount Summary report.

    Expected data keys (from report_service.get_date_wise_amount):
        date_from, date_to, branch_name, payment_mode_name,
        rows (list of {ticket_date, amount}), grand_total
    """
    title = "Date Wise Amount Summary"
    subtitle = _date_range_subtitle(data, _optional_filter_parts(data))

    headers = ["Ticket Date", "Amount"]
    pdf_rows: list[list[str]] = []
    for row in data.get("rows", []):
        pdf_rows.append([
            _fmt_date(row["ticket_date"]),
            _fmt_amount(row["amount"]),
        ])

    # Totals row
    pdf_rows.append(["Total", _fmt_amount(data.get("grand_total", 0))])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
    )


# ---------------------------------------------------------------------------
# 2. Ferry Wise Item Summary
# ---------------------------------------------------------------------------

def generate_ferry_wise_item_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Ferry Wise Item Summary report.

    Expected data keys (from report_service.get_ferry_wise_item_summary):
        report_date, branch_name, rows (list of {departure, item_name, quantity})
    """
    title = "Ferry Wise Item Summary"
    subtitle = _single_date_subtitle(data, extra_parts=_optional_filter_parts(data))

    headers = ["Time", "Item", "Quantity"]
    pdf_rows: list[list[str]] = []
    for row in data.get("rows", []):
        pdf_rows.append([
            str(row.get("departure", "")),
            str(row.get("item_name", "")),
            str(row.get("quantity", 0)),
        ])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
    )


# ---------------------------------------------------------------------------
# 3. Itemwise Levy Summary
# ---------------------------------------------------------------------------

def generate_itemwise_levy_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Itemwise Levy Summary report.

    Expected data keys (from report_service.get_itemwise_levy_summary):
        date_from, date_to, branch_name, route_name,
        rows (list of {item_name, levy, quantity, amount}), grand_total
    """
    title = "Itemwise Levy Summary"
    subtitle = _date_range_subtitle(data, _optional_filter_parts(data))

    headers = ["Item", "Levy", "Quantity", "Amount"]
    pdf_rows: list[list[str]] = []
    for row in data.get("rows", []):
        pdf_rows.append([
            str(row.get("item_name", "")),
            _fmt_amount(row.get("levy", 0)),
            str(row.get("quantity", 0)),
            _fmt_amount(row.get("amount", 0)),
        ])

    # Totals row
    total_qty = sum(r.get("quantity", 0) for r in data.get("rows", []))
    pdf_rows.append([
        "Total",
        "",
        str(total_qty),
        _fmt_amount(data.get("grand_total", 0)),
    ])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
    )


# ---------------------------------------------------------------------------
# 4. Payment Mode Wise Summary
# ---------------------------------------------------------------------------

def generate_payment_mode_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Payment Mode Wise Summary report.

    Expected data keys (from report_service.get_payment_mode_report):
        date_from, date_to,
        rows (list of {payment_mode_name, ticket_count, booking_count,
              ticket_revenue, booking_revenue, total_count, total_revenue})
    """
    title = "Payment Mode Wise Summary"
    subtitle = _date_range_subtitle(data, _optional_filter_parts(data))

    headers = ["Payment Mode", "Tickets", "Amount"]
    pdf_rows: list[list[str]] = []
    total_tickets = 0
    total_amount = 0.0
    for row in data.get("rows", []):
        # Combine ticket_count + booking_count for total tickets
        tickets = row.get("ticket_count", 0) + row.get("booking_count", 0)
        # Combine ticket_revenue + booking_revenue for total amount
        amount = float(row.get("ticket_revenue", 0)) + float(row.get("booking_revenue", 0))
        total_tickets += tickets
        total_amount += amount
        pdf_rows.append([
            str(row.get("payment_mode_name", "")),
            str(tickets),
            _fmt_amount(amount),
        ])

    # Totals row
    pdf_rows.append(["Total", str(total_tickets), _fmt_amount(total_amount)])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
    )


# ---------------------------------------------------------------------------
# 5. Ticket Details
# ---------------------------------------------------------------------------

def generate_ticket_details_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Ticket Details report.

    Expected data keys:
        date (or date_from/date_to), branch_name,
        rows (list of ticket dicts with ticket_date, ticket_no, departure,
              payment_mode_name, net_amount, is_cancelled)
    """
    title = "Ticket Details"

    # Build subtitle: supports both single date and date range
    extra = _optional_filter_parts(data)
    if data.get("date"):
        subtitle = _single_date_subtitle(data, date_key="date", extra_parts=extra)
    elif data.get("report_date"):
        subtitle = _single_date_subtitle(data, date_key="report_date", extra_parts=extra)
    else:
        subtitle = _date_range_subtitle(data, extra)

    headers = ["Date", "Ticket No", "Time", "Payment Mode", "Amount", "Status"]
    pdf_rows: list[list[str]] = []
    total_amount = 0.0
    for row in data.get("rows", []):
        net_amount = float(row.get("net_amount", 0))
        is_cancelled = row.get("is_cancelled", False)
        if not is_cancelled:
            total_amount += net_amount

        pdf_rows.append([
            _fmt_date(row.get("ticket_date")),
            str(row.get("ticket_no", "")),
            str(row.get("departure", "")),
            str(row.get("payment_mode_name", "")),
            _fmt_amount(net_amount),
            "Cancelled" if is_cancelled else "Active",
        ])

    # Totals row
    pdf_rows.append(["", "", "", "Total", _fmt_amount(total_amount), ""])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
        landscape_mode=True,
    )


# ---------------------------------------------------------------------------
# 6. User Wise Daily Cash Summary
# ---------------------------------------------------------------------------

def generate_user_wise_summary_pdf(data: dict) -> BytesIO:
    """Generate PDF for the User Wise Daily Cash Summary report.

    Expected data keys (from report_service.get_user_wise_summary):
        report_date, rows (list of {user_name, amount}), grand_total
    """
    title = "User Wise Daily Cash Summary"
    subtitle = _single_date_subtitle(data, extra_parts=_optional_filter_parts(data))

    headers = ["User Name", "Amount"]
    pdf_rows: list[list[str]] = []
    for row in data.get("rows", []):
        pdf_rows.append([
            str(row.get("user_name", "")),
            _fmt_amount(row.get("amount", 0)),
        ])

    # Totals row
    pdf_rows.append(["Total", _fmt_amount(data.get("grand_total", 0))])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
    )


# ---------------------------------------------------------------------------
# 7. Vehicle Wise Ticket Details
# ---------------------------------------------------------------------------

def generate_vehicle_wise_tickets_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Vehicle Wise Ticket Details report.

    Expected data keys (from report_service.get_vehicle_wise_tickets):
        report_date, branch_name,
        rows (list of {ticket_date, ticket_no, departure, payment_mode,
              amount, vehicle_no}),
        grand_total
    """
    title = "Vehicle Wise Ticket Details"
    subtitle = _single_date_subtitle(data, extra_parts=_optional_filter_parts(data))

    headers = ["Date", "Ticket No", "Time", "Payment Mode", "Amount", "Vehicle No"]
    pdf_rows: list[list[str]] = []
    for row in data.get("rows", []):
        pdf_rows.append([
            _fmt_date(row.get("ticket_date")),
            str(row.get("ticket_no", "")),
            str(row.get("departure", "")),
            str(row.get("payment_mode", "")),
            _fmt_amount(row.get("amount", 0)),
            str(row.get("vehicle_no", "") or ""),
        ])

    # Totals row
    pdf_rows.append(["", "", "", "Total", _fmt_amount(data.get("grand_total", 0)), ""])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
        landscape_mode=True,
    )


# ---------------------------------------------------------------------------
# 8. Branch Summary
# ---------------------------------------------------------------------------

def generate_branch_summary_pdf(data: dict) -> BytesIO:
    """Generate PDF for the Branch Summary report.

    Expected data keys (from report_service.get_branch_summary_report):
        date_from, date_to,
        rows (list of {branch_name, ticket_count, booking_count,
              ticket_revenue, booking_revenue, total_revenue})
    """
    title = "Branch Summary"
    subtitle = _date_range_subtitle(data)

    headers = ["Branch", "Tickets", "Bookings", "Ticket Revenue", "Booking Revenue", "Total Revenue"]
    pdf_rows: list[list[str]] = []
    total_tickets = 0
    total_bookings = 0
    total_ticket_rev = 0.0
    total_booking_rev = 0.0
    total_revenue = 0.0
    for row in data.get("rows", []):
        t_count = row.get("ticket_count", 0)
        b_count = row.get("booking_count", 0)
        t_rev = float(row.get("ticket_revenue", 0))
        b_rev = float(row.get("booking_revenue", 0))
        t_total = float(row.get("total_revenue", t_rev + b_rev))
        total_tickets += t_count
        total_bookings += b_count
        total_ticket_rev += t_rev
        total_booking_rev += b_rev
        total_revenue += t_total
        pdf_rows.append([
            str(row.get("branch_name", "")),
            str(t_count),
            str(b_count),
            _fmt_amount(t_rev),
            _fmt_amount(b_rev),
            _fmt_amount(t_total),
        ])

    # Totals row
    pdf_rows.append([
        "Total",
        str(total_tickets),
        str(total_bookings),
        _fmt_amount(total_ticket_rev),
        _fmt_amount(total_booking_rev),
        _fmt_amount(total_revenue),
    ])

    return _build_pdf(
        title=title,
        subtitle=subtitle,
        headers=headers,
        rows=pdf_rows,
        landscape_mode=True,
    )
