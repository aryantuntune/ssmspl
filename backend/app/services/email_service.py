import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


def _build_password_reset_html(reset_link: str, user_name: str) -> str:
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:linear-gradient(135deg,#0a2a38,#1a6b8a);color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Password Reset</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>Hello {user_name},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align:center;margin:32px 0;">
                <a href="{reset_link}"
                   style="display:inline-block;background:linear-gradient(to right,#f59e0b,#ea580c);color:white;
                          padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
                    Reset Password
                </a>
            </div>
            <p style="color:#666;font-size:14px;">This link will expire in <strong>15 minutes</strong>.</p>
            <p style="color:#666;font-size:14px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#999;font-size:12px;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="{reset_link}" style="color:#0284c7;word-break:break-all;">{reset_link}</a>
            </p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_password_reset_email(to_email: str, reset_link: str, user_name: str) -> None:
    """Send password reset email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping password reset email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Password Reset - SSMSPL Ferry Services"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_password_reset_html(reset_link, user_name)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"Password reset email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")


def _build_otp_email_html(otp: str, user_name: str, purpose: str) -> str:
    purpose_text = "verify your email address" if purpose == "registration" else "reset your password"
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:linear-gradient(135deg,#0a2a38,#1a6b8a);color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Verification Code</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>Hello {user_name},</p>
            <p>Use the following code to {purpose_text}:</p>
            <div style="text-align:center;margin:32px 0;">
                <div style="display:inline-block;background:#f0f9ff;border:2px dashed #0284c7;border-radius:12px;padding:20px 40px;">
                    <span style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#0a2a38;">{otp}</span>
                </div>
            </div>
            <p style="color:#666;font-size:14px;">This code will expire in <strong>10 minutes</strong>.</p>
            <p style="color:#666;font-size:14px;">If you did not request this code, please ignore this email.</p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_otp_email(to_email: str, otp: str, user_name: str, purpose: str) -> None:
    """Send OTP verification email. Fire-and-forget, logs errors."""
    logger.debug(f"OTP for {to_email} ({purpose}): {otp}")

    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping OTP email (OTP logged above in DEBUG)")
        return

    try:
        subject = "Verify Your Email" if purpose == "registration" else "Password Reset Code"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{subject} - SSMSPL Ferry Services"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_otp_email_html(otp, user_name, purpose)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"OTP email sent to {to_email} ({purpose})")
    except Exception as e:
        logger.error(f"Failed to send OTP email to {to_email}: {e}")


def _build_contact_form_html(sender_name: str, sender_email: str, sender_phone: str, message: str) -> str:
    phone_row = ""
    if sender_phone:
        phone_row = f"""
            <tr>
                <td style="padding:8px;color:#666;font-weight:bold;vertical-align:top;">Phone</td>
                <td style="padding:8px;">{sender_phone}</td>
            </tr>"""
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:linear-gradient(135deg,#0a2a38,#1a6b8a);color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">New Contact Form Message</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Website</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="padding:8px;color:#666;font-weight:bold;vertical-align:top;">Name</td>
                    <td style="padding:8px;">{sender_name}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;font-weight:bold;vertical-align:top;">Email</td>
                    <td style="padding:8px;"><a href="mailto:{sender_email}" style="color:#0284c7;">{sender_email}</a></td>
                </tr>{phone_row}
                <tr>
                    <td style="padding:8px;color:#666;font-weight:bold;vertical-align:top;">Message</td>
                    <td style="padding:8px;white-space:pre-wrap;">{message}</td>
                </tr>
            </table>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Sent from the SSMSPL website contact form
        </div>
    </div>
    """


async def send_contact_form_email(sender_name: str, sender_email: str, sender_phone: str, message: str) -> None:
    """Send contact form submission to company email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping contact form email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Website Contact: {sender_name}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = settings.CONTACT_FORM_RECIPIENT
        msg["Reply-To"] = sender_email

        html = _build_contact_form_html(sender_name, sender_email, sender_phone, message)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"Contact form email sent from {sender_email}")
    except Exception as e:
        logger.error(f"Failed to send contact form email from {sender_email}: {e}")


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
            start_tls=True,
        )
        logger.info(f"Booking confirmation email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send booking confirmation email to {to_email}: {e}")
