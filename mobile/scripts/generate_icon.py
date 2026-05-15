"""
Generate the SSMSPL Admin Console app icons + splash.

Style:
    Charcoal-navy background (matches theme.ts colors.bg / bgElev)
    Centered shield silhouette
    Cyan accent stroke (theme.ts colors.action.primary  #0891b2)
    Inset checkmark + "A" mark communicating "admin"
    Single-color light-on-dark with a soft drop shadow.

Outputs (overwrites existing files):
    mobile/assets/icon.png            1024 x 1024  (square, full bleed background)
    mobile/assets/adaptive-icon.png   1024 x 1024  (transparent bg, shield within
                                                    safe 432 x 432 inner area)
    mobile/assets/splash.png          1080 x 1920  (portrait, shield centered)

Run:
    python mobile/scripts/generate_icon.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- Palette (mirrors mobile/src/theme.ts) ---------------------------------
BG = (10, 15, 26)          # colors.bg            #0a0f1a
BG_ELEV = (17, 24, 39)     # colors.bgElev        #111827
ACCENT = (8, 145, 178)     # colors.action.primary #0891b2
ACCENT_LIGHT = (34, 211, 238)   # cyan-400 (rim highlight)
LIGHT = (236, 254, 255)    # colors.action.primaryText #ecfeff
SHADOW = (0, 0, 0)

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def _shield_polygon(cx: int, cy: int, w: int, h: int) -> list[tuple[float, float]]:
    """Classic heraldic shield outline.

    Top edge: flat (slightly bowed up).
    Sides: roughly straight in the upper third, then sweep inward to a
    rounded point at the bottom centre.
    Built by sampling along a parametric path so we get a smooth silhouette
    at any size.
    """
    pts: list[tuple[float, float]] = []
    half_w = w / 2.0
    half_h = h / 2.0
    top = cy - half_h
    bottom = cy + half_h

    # ---- Top edge (left to right, slight upward bow) ----
    n_top = 24
    for i in range(n_top + 1):
        u = i / n_top
        x = cx - half_w + u * w
        # bow up by ~3% of half_h at centre
        bow = -0.04 * half_h * (1 - (2 * u - 1) ** 2)
        y = top + bow
        pts.append((x, y))

    # ---- Right side: straight near top, curve inward near bottom ----
    n_side = 40
    for i in range(1, n_side + 1):
        u = i / n_side
        # First 35% of side: barely tapers.  Then aggressive curve to the
        # bottom centre point.
        if u < 0.35:
            taper = 1 - 0.06 * (u / 0.35)  # very gentle
        else:
            v = (u - 0.35) / 0.65
            taper = 0.94 * (1 - v ** 1.6)
        x = cx + half_w * taper
        y = top + u * h
        pts.append((x, y))

    # ---- Bottom rounded point (a few extra samples for smoothness) ----
    # Last right-side sample landed at (cx, bottom).  Mirror back up.

    # ---- Left side: bottom-centre back up to top-left ----
    for i in range(1, n_side + 1):
        u = i / n_side
        # Mirror of the right side, traversed in reverse so the polygon
        # is wound consistently.
        if u < 0.65:
            v = u / 0.65
            taper = 0.94 * (1 - (1 - v) ** 1.6)
        else:
            v = (u - 0.65) / 0.35
            taper = 1 - 0.06 * (1 - v)
        x = cx - half_w * taper
        y = bottom - u * h
        pts.append((x, y))

    return pts


def _draw_shield(canvas: Image.Image, cx: int, cy: int, size: int) -> None:
    """Draw the shield centered at (cx, cy), fitting within `size` x `size`."""
    # Geometry: shield height = size, width = ~0.84 * size for the classic ratio.
    h = size
    w = int(size * 0.84)
    poly = _shield_polygon(cx, cy, w, h)

    # ---- Soft drop shadow (separate layer + gaussian blur) ----
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    offset_y = int(size * 0.025)
    sd.polygon([(x, y + offset_y) for (x, y) in poly], fill=(0, 0, 0, 140))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=int(size * 0.035)))
    canvas.alpha_composite(shadow_layer)

    # ---- Shield body: filled with a slightly elevated charcoal so it sits
    # above the background even on flat-color renderers ----
    body = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bd.polygon(poly, fill=BG_ELEV + (255,))
    canvas.alpha_composite(body)

    # ---- Cyan stroke around the shield (the brand accent) ----
    stroke = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sk = ImageDraw.Draw(stroke)
    stroke_w = max(8, int(size * 0.05))
    # Outline stroke
    sk.polygon(poly, outline=ACCENT + (255,), width=stroke_w)
    # Subtle inner rim highlight one pixel band lighter
    inner = [
        (cx + (x - cx) * 0.93, cy + (y - cy) * 0.93) for (x, y) in poly
    ]
    sk.polygon(inner, outline=ACCENT_LIGHT + (90,), width=max(2, int(size * 0.012)))
    canvas.alpha_composite(stroke)

    # ---- Inset admin mark: a checkmark + "A" stacked, centered in the shield ----
    _draw_admin_mark(canvas, cx, cy, size)


def _draw_admin_mark(canvas: Image.Image, cx: int, cy: int, size: int) -> None:
    """Inset glyph: a tick mark on top, capital A below.

    All coordinates expressed as offsets from (cx, cy) in units of `size`
    so the mark stays proportional whatever the canvas dimensions are.
    Designed to read at thumbnail size — bold strokes, generous spacing.
    """
    mark = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(mark)

    # --- Check mark (sits in the upper half of the shield) ---
    # Three points: low-left elbow, bottom-centre pivot, high-right tip.
    # All offsets are within ±0.20 of cy so the tick lives strictly in the
    # upper third of the shield interior.
    p1 = (cx - int(size * 0.16), cy - int(size * 0.08))   # left elbow
    p2 = (cx - int(size * 0.03), cy + int(size * 0.02))   # pivot (just below cy)
    p3 = (cx + int(size * 0.17), cy - int(size * 0.16))   # right tip

    stroke_w = max(10, int(size * 0.07))
    d.line([p1, p2], fill=LIGHT + (255,), width=stroke_w, joint="curve")
    d.line([p2, p3], fill=LIGHT + (255,), width=stroke_w, joint="curve")

    # Rounded endpoints (PIL line joints don't round line caps in older versions)
    cap_r = stroke_w // 2
    for (x, y) in (p1, p2, p3):
        d.ellipse((x - cap_r, y - cap_r, x + cap_r, y + cap_r), fill=LIGHT + (255,))

    # --- Letter "A" below the tick ---
    a_top = cy + int(size * 0.10)
    a_bot = cy + int(size * 0.30)
    a_half_w = int(size * 0.11)
    a_apex = (cx, a_top)
    a_left = (cx - a_half_w, a_bot)
    a_right = (cx + a_half_w, a_bot)

    a_stroke = max(8, int(size * 0.052))
    d.line([a_left, a_apex], fill=LIGHT + (255,), width=a_stroke, joint="curve")
    d.line([a_apex, a_right], fill=LIGHT + (255,), width=a_stroke, joint="curve")
    # Crossbar
    bar_y = a_top + int((a_bot - a_top) * 0.62)
    bar_inset = int(a_half_w * 0.40)
    d.line(
        [(cx - a_half_w + bar_inset, bar_y), (cx + a_half_w - bar_inset, bar_y)],
        fill=LIGHT + (255,),
        width=max(6, int(size * 0.032)),
    )
    # Endpoint caps for A
    for (x, y) in (a_apex, a_left, a_right):
        d.ellipse(
            (x - a_stroke // 2, y - a_stroke // 2, x + a_stroke // 2, y + a_stroke // 2),
            fill=LIGHT + (255,),
        )

    canvas.alpha_composite(mark)


def make_icon(path: Path, size: int = 1024, *, transparent_bg: bool = False) -> None:
    """Square icon. If transparent_bg, the canvas is transparent and the
    shield is sized to live inside the Android adaptive-icon safe area
    (~66% of canvas)."""
    bg_color = (0, 0, 0, 0) if transparent_bg else BG + (255,)
    img = Image.new("RGBA", (size, size), bg_color)

    if not transparent_bg:
        # Subtle radial vignette: paint a slightly lighter circle then darken
        # the corners. Pure flat #0a0f1a looks dead on AMOLED, this gives it
        # a hint of dimensional depth without going color-noisy.
        vignette = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        vd = ImageDraw.Draw(vignette)
        r = int(size * 0.42)
        vd.ellipse(
            (size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r),
            fill=(20, 30, 50, 255),
        )
        vignette = vignette.filter(ImageFilter.GaussianBlur(radius=int(size * 0.18)))
        img.alpha_composite(vignette)

    # Shield sizing
    if transparent_bg:
        # Android adaptive icon safe inner area is ~432 in a 1024 canvas. Stay
        # well within so the launcher's circle/squircle mask never clips us.
        shield_size = int(size * 0.62)
    else:
        shield_size = int(size * 0.72)

    cx = size // 2
    cy = size // 2
    _draw_shield(img, cx, cy, shield_size)

    img.save(path, format="PNG", optimize=True)


def make_splash(path: Path, w: int = 1080, h: int = 1920) -> None:
    """Portrait splash. Same palette, shield centered at ~38% from top so
    that on most phones the shield sits in the upper third (where the eye
    lands first), with breathing room above for the status bar."""
    img = Image.new("RGBA", (w, h), BG + (255,))

    # Vignette (taller, soft)
    vignette = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    r = int(min(w, h) * 0.45)
    vd.ellipse(
        (w // 2 - r, int(h * 0.42) - r, w // 2 + r, int(h * 0.42) + r),
        fill=(20, 30, 50, 255),
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=int(min(w, h) * 0.12)))
    img.alpha_composite(vignette)

    shield_size = int(min(w, h) * 0.45)
    cx = w // 2
    cy = int(h * 0.42)
    _draw_shield(img, cx, cy, shield_size)

    # ---- Wordmark below the shield ----
    # No bundled font path is guaranteed on Windows; fall back to default if
    # arial isn't reachable. The wordmark is intentionally restrained.
    try:
        font_path = None
        for candidate in (
            r"C:\\Windows\\Fonts\\segoeuib.ttf",
            r"C:\\Windows\\Fonts\\arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ):
            if os.path.exists(candidate):
                font_path = candidate
                break
        font = ImageFont.truetype(font_path, int(min(w, h) * 0.045)) if font_path else ImageFont.load_default()
        sub_font = ImageFont.truetype(font_path, int(min(w, h) * 0.022)) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    d = ImageDraw.Draw(img)
    wm = "SSMSPL"
    sub = "Admin Console"

    # Centre text relative to canvas
    bbox = d.textbbox((0, 0), wm, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    ty = cy + shield_size // 2 + int(min(w, h) * 0.08)
    d.text(((w - tw) // 2, ty), wm, fill=LIGHT + (255,), font=font)

    sbbox = d.textbbox((0, 0), sub, font=sub_font)
    stw = sbbox[2] - sbbox[0]
    sty = ty + th + int(min(w, h) * 0.015)
    d.text(((w - stw) // 2, sty), sub, fill=ACCENT + (255,), font=sub_font)

    img.save(path, format="PNG", optimize=True)


def verify(path: Path, min_size: int = 4096) -> None:
    sz = path.stat().st_size
    if sz < min_size:
        raise RuntimeError(f"{path} is suspiciously small: {sz} bytes")
    with Image.open(path) as im:
        im.verify()  # raises on corrupt PNGs
    print(f"  ok  {path.name}  ({sz/1024:.1f} KB)")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    icon = ASSETS / "icon.png"
    adaptive = ASSETS / "adaptive-icon.png"
    splash = ASSETS / "splash.png"

    print("Generating icon (1024x1024, full background)...")
    make_icon(icon, 1024, transparent_bg=False)

    print("Generating adaptive icon (1024x1024, transparent)...")
    make_icon(adaptive, 1024, transparent_bg=True)

    print("Generating splash (1080x1920)...")
    make_splash(splash, 1080, 1920)

    print("\nVerifying:")
    verify(icon)
    verify(adaptive)
    verify(splash)
    print("\nDone.")


if __name__ == "__main__":
    main()
