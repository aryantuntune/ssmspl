import hmac
import hashlib
import io
from pathlib import Path

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import StyledPilQRModuleDrawer
from PIL import Image, ImageDraw, ImageFilter

from app.config import settings

_LOGO_PATH = Path(__file__).resolve().parents[2] / "logo.png"


# ---------------------------------------------------------------------------
# Custom QR style drawers
# ---------------------------------------------------------------------------

class DiamondModuleDrawer(StyledPilQRModuleDrawer):
    """Draws modules as diamonds (45-degree rotated squares)."""

    def initialize(self, *args, **kwargs):
        super().initialize(*args, **kwargs)
        self.imgDraw = ImageDraw.Draw(self.img._img)

    def drawrect(self, box, is_active):
        if not is_active:
            return
        x1, y1 = box[0]
        x2, y2 = box[1]
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        half_w = (x2 - x1) / 2 * 0.85
        half_h = (y2 - y1) / 2 * 0.85
        diamond = [
            (cx, cy - half_h),
            (cx + half_w, cy),
            (cx, cy + half_h),
            (cx - half_w, cy),
        ]
        self.imgDraw.polygon(diamond, fill=self.img.paint_color)


class SolidEyeDrawer(StyledPilQRModuleDrawer):
    """Draws finder pattern eyes as solid bold filled squares."""

    def initialize(self, *args, **kwargs):
        super().initialize(*args, **kwargs)
        self.imgDraw = ImageDraw.Draw(self.img._img)

    def drawrect(self, box, is_active):
        if is_active:
            x1, y1 = box[0]
            x2, y2 = box[1]
            self.imgDraw.rectangle([x1, y1, x2, y2], fill=self.img.paint_color)


# ---------------------------------------------------------------------------
# HMAC signing / verification
# ---------------------------------------------------------------------------

def _sign_code(verification_code: str) -> str:
    """Create an HMAC-SHA256 signature for the verification code."""
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        verification_code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:16]


def generate_qr_payload(verification_code: str) -> str:
    """Build the signed QR payload: {code}.{signature}"""
    sig = _sign_code(verification_code)
    return f"{verification_code}.{sig}"


def verify_qr_payload(payload: str) -> str | None:
    """
    Validate a signed QR payload. Returns the verification_code if valid, None if tampered.
    Also accepts a bare UUID for backward compatibility.
    """
    if "." in payload:
        last_dot = payload.rfind(".")
        code = payload[:last_dot]
        sig = payload[last_dot + 1:]
        expected = _sign_code(code)
        if hmac.compare_digest(sig, expected):
            return code
        return None

    return payload


# ---------------------------------------------------------------------------
# QR image generation
# ---------------------------------------------------------------------------

def generate_qr_png(verification_code: str) -> bytes:
    """Generate a styled QR code PNG with diamond modules, rounded eyes, and blended logo."""
    data = generate_qr_payload(verification_code)

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    qr_img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=DiamondModuleDrawer(),
        eye_drawer=SolidEyeDrawer(),
    ).convert("RGBA")

    if _LOGO_PATH.exists():
        logo = Image.open(_LOGO_PATH).convert("RGBA")
        qr_w, qr_h = qr_img.size
        logo_size = int(qr_w * 0.26)

        # Resize preserving aspect ratio
        ratio = logo.width / logo.height
        if ratio > 1:
            new_w, new_h = logo_size, int(logo_size / ratio)
        else:
            new_h, new_w = logo_size, int(logo_size * ratio)
        logo = logo.resize((new_w, new_h), Image.LANCZOS)

        # Build a white backing that follows the logo's shape (not a rectangle)
        # so transparent areas of the logo let QR modules show through
        logo_alpha = logo.split()[3]
        expanded_alpha = logo_alpha.filter(ImageFilter.MaxFilter(size=15))
        white_base = Image.new("RGBA", logo.size, (255, 255, 255, 255))
        backing = Image.new("RGBA", logo.size, (0, 0, 0, 0))
        backing.paste(white_base, mask=expanded_alpha)

        lx = (qr_w - new_w) // 2
        ly = (qr_h - new_h) // 2

        # Composite: QR → shape-matched white backing → logo
        backing_layer = Image.new("RGBA", qr_img.size, (0, 0, 0, 0))
        backing_layer.paste(backing, (lx, ly))
        qr_img = Image.alpha_composite(qr_img, backing_layer)

        logo_layer = Image.new("RGBA", qr_img.size, (0, 0, 0, 0))
        logo_layer.paste(logo, (lx, ly), logo)
        qr_img = Image.alpha_composite(qr_img, logo_layer)

    final = qr_img.convert("RGB")
    buffer = io.BytesIO()
    final.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()
