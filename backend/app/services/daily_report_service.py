"""
Background task: generate and email a per-branch item-wise daily report
at 23:59 IST every day to configured recipients.
"""
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.branch import Branch
from app.models.daily_report_recipient import DailyReportRecipient
from app.services import email_service, report_service

logger = logging.getLogger("ssmspl.daily_report")

CHECK_INTERVAL_SECONDS = 60  # Check every minute
SEND_HOUR = 23
SEND_MINUTE = 59

_last_sent_date: date | None = None


async def daily_report_loop():
    """Main loop — runs forever, fires the report once per day at 23:59 IST."""
    global _last_sent_date
    while True:
        try:
            now = datetime.now(timezone.utc)
            # Convert to IST (UTC+5:30) since branches operate in India
            ist_now = now + timedelta(hours=5, minutes=30)

            if (
                ist_now.hour == SEND_HOUR
                and ist_now.minute == SEND_MINUTE
                and _last_sent_date != ist_now.date()
            ):
                _last_sent_date = ist_now.date()
                await _generate_and_send_report(ist_now.date())
        except Exception:
            logger.exception("Error in daily report loop")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def _generate_and_send_report(report_date: date):
    """Collect branch-wise item summaries and email them to all active recipients."""
    async with AsyncSessionLocal() as db:
        try:
            # Get active recipients
            result = await db.execute(
                select(DailyReportRecipient).where(
                    DailyReportRecipient.is_active == True  # noqa: E712
                )
            )
            recipients = result.scalars().all()
            if not recipients:
                logger.info("No active daily report recipients, skipping")
                return

            # Get all active branches
            branch_result = await db.execute(
                select(Branch)
                .where(Branch.is_active == True)  # noqa: E712
                .order_by(Branch.name)
            )
            branches = branch_result.scalars().all()

            # Collect data for each branch
            branch_reports = []
            overall_grand_total = 0.0
            for branch in branches:
                data = await report_service.get_branch_item_summary(
                    db, report_date, report_date, branch.id
                )
                if data["rows"]:  # Only include branches that had transactions
                    branch_reports.append(data)
                    overall_grand_total += float(data["grand_total"])

            if not branch_reports:
                logger.info("No transactions today, skipping daily report email")
                return

            # Build and send email
            html = _build_daily_report_html(report_date, branch_reports, overall_grand_total)
            recipient_emails = [r.email for r in recipients]

            await email_service.send_daily_report_email(
                to_emails=recipient_emails,
                subject=f"SSMSPL Daily Report — {report_date.strftime('%d/%m/%Y')}",
                html_body=html,
            )
            logger.info(
                "Daily report sent to %d recipients for %s",
                len(recipient_emails),
                report_date,
            )
        except Exception:
            logger.exception("Error generating daily report for %s", report_date)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt_inr(amount) -> str:
    """Format number as Indian currency: 1,23,456.00"""
    num = float(amount)
    if num < 0:
        return f"-{_fmt_inr(-num)}"
    s = f"{num:,.2f}"
    # Convert 1,234,567.89 to 12,34,567.89 (Indian grouping)
    parts = s.split(".")
    integer_part = parts[0].replace(",", "")
    if len(integer_part) <= 3:
        return s
    last3 = integer_part[-3:]
    rest = integer_part[:-3]
    # Group remaining digits in pairs from right
    groups = []
    while rest:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    return ",".join(groups) + "," + last3 + "." + parts[1]


def _build_daily_report_html(
    report_date: date,
    branch_reports: list[dict],
    overall_grand_total: float,
) -> str:
    """Build a professional HTML email with per-branch item summaries."""

    branch_sections = ""
    for report in branch_reports:
        branch_name = report.get("branch_name") or "Unknown Branch"
        rows = report.get("rows", [])
        payment_modes = report.get("payment_modes", [])
        grand_total = float(report.get("grand_total", 0))

        # Item rows
        item_rows_html = ""
        for row in rows:
            item_rows_html += (
                f'<tr>'
                f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{row["item_name"]}</td>'
                f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;{_fmt_inr(row["rate"])}</td>'
                f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">{row["quantity"]}</td>'
                f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;{_fmt_inr(row["net"])}</td>'
                f'</tr>'
            )

        # Payment mode rows
        pm_rows_html = ""
        for pm in payment_modes:
            pm_rows_html += (
                f'<tr>'
                f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">{pm["payment_mode_name"]}</td>'
                f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;{_fmt_inr(pm["amount"])}</td>'
                f'</tr>'
            )

        branch_sections += f"""
        <div style="margin-bottom:24px;">
            <div style="background:#1a6b8a;color:white;padding:10px 16px;border-radius:6px 6px 0 0;">
                <strong style="font-size:15px;">{branch_name}</strong>
            </div>
            <table style="width:100%;border-collapse:collapse;background:#ffffff;">
                <thead>
                    <tr style="background:#f0f9ff;">
                        <th style="padding:8px 12px;text-align:left;font-size:13px;color:#0a2a38;border-bottom:2px solid #0284c7;">Item</th>
                        <th style="padding:8px 12px;text-align:right;font-size:13px;color:#0a2a38;border-bottom:2px solid #0284c7;">Rate</th>
                        <th style="padding:8px 12px;text-align:center;font-size:13px;color:#0a2a38;border-bottom:2px solid #0284c7;">Qty</th>
                        <th style="padding:8px 12px;text-align:right;font-size:13px;color:#0a2a38;border-bottom:2px solid #0284c7;">Net</th>
                    </tr>
                </thead>
                <tbody>
                    {item_rows_html}
                    <tr style="background:#f0f9ff;">
                        <td colspan="3" style="padding:10px 12px;font-weight:bold;color:#0a2a38;">Branch Total</td>
                        <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#0a2a38;">&#8377;{_fmt_inr(grand_total)}</td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top:8px;">
                <table style="width:100%;border-collapse:collapse;background:#fafbfc;">
                    <thead>
                        <tr>
                            <th style="padding:6px 12px;text-align:left;font-size:12px;color:#666;border-bottom:1px solid #e2e8f0;">Payment Mode</th>
                            <th style="padding:6px 12px;text-align:right;font-size:12px;color:#666;border-bottom:1px solid #e2e8f0;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pm_rows_html}
                    </tbody>
                </table>
            </div>
        </div>
        """

    return f"""
    <div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:linear-gradient(135deg,#0a2a38,#1a6b8a);color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:22px;">SSMSPL Daily Report</h1>
            <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">{report_date.strftime('%d %B %Y')}</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p style="margin:0 0 16px;color:#555;font-size:14px;">
                Below is the item-wise billing summary for each branch on <strong>{report_date.strftime('%d/%m/%Y')}</strong>.
            </p>
            {branch_sections}
            <div style="margin-top:24px;padding:16px;background:linear-gradient(135deg,#0a2a38,#1a6b8a);border-radius:8px;text-align:center;">
                <span style="color:rgba(255,255,255,0.8);font-size:13px;">Overall Grand Total</span><br/>
                <span style="color:white;font-size:24px;font-weight:bold;">&#8377;{_fmt_inr(overall_grand_total)}</span>
            </div>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """
