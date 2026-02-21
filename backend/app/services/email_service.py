import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


def _build_booking_confirmation_html(booking: dict) -> str:
    items_html = ""
    for item in (booking.get("items") or []):
        items_html += f"""
        <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">{item.get('item_name', 'Item')}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">{item.get('quantity', 0)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">&#8377;{item.get('amount', 0):.2f}</td>
        </tr>
        """

    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#0284c7;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Booking Confirmed</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>Dear Customer,</p>
            <p>Your ferry booking has been confirmed. Here are the details:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr>
                    <td style="padding:8px;color:#666;">Booking Ref</td>
                    <td style="padding:8px;font-weight:bold;">#{booking.get('booking_no', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Route</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('route_name', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Travel Date</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('travel_date', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Departure</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('departure', '')}</td>
                </tr>
            </table>
            <h3 style="margin:16px 0 8px;">Items</h3>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:8px;text-align:left;">Item</th>
                        <th style="padding:8px;text-align:center;">Qty</th>
                        <th style="padding:8px;text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            <div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;text-align:right;">
                <span style="font-size:18px;font-weight:bold;color:#0284c7;">Total: &#8377;{booking.get('net_amount', 0):.2f}</span>
            </div>
            <p style="margin-top:24px;color:#666;font-size:14px;">
                Please show your QR code at the jetty for boarding. You can view it in your booking history.
            </p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_booking_confirmation(booking: dict, to_email: str) -> None:
    """Send booking confirmation email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping booking confirmation email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Booking Confirmed - #{booking.get('booking_no', '')}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_booking_confirmation_html(booking)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=True,
        )
        logger.info(f"Booking confirmation email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send booking confirmation email to {to_email}: {e}")
