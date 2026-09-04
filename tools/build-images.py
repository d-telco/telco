#!/usr/bin/env python3
"""Render every image the storefront and the app need, from the catalogue itself.

Why generated rather than photographed. The catalogue holds 40 handsets and a stock library
holds none of them by name, so photographs would put an unrelated phone on a card labelled
"iPhone 17 Pro 256 GB Black". That is the sort of detail a prospect's engineer sees in the
first two minutes and never lets go of. A drawn tile reads as a demo catalogue, is truthful
about being one, is consistent across 432 of them, and costs nothing to regenerate when a
price or a colour changes.

Deterministic: same catalogue in, same bytes out, so a rebuild is not a diff.

Outputs
  assets/catalog/<slug>-{400,1200,1600}.jpg   one per product and per coloured variant
  assets/editorial/<name>-{800,1600,2400}.jpg heroes and category art
  assets/push/<name>.jpg                      2:1 rich push images, 20 KB to 200 KB
  assets/brand/                               mark, icons, favicon
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_CAT = f"{ROOT}/assets/catalog"
OUT_ED = f"{ROOT}/assets/editorial"
OUT_PUSH = f"{ROOT}/assets/push"
OUT_BRAND = f"{ROOT}/assets/brand"
SIZES = (1600, 1200, 400)

# Palette supplied for this build: black utility bar, white
# nav, a brand red close to E4002B on the logo, the Shop button and the card headers, a hotter
# red in the hero gradient, a pale pink card body, rounded corners near 12px.
RED       = (228, 0, 43)
RED_HOT   = (255, 46, 82)
RED_DEEP  = (150, 0, 30)
PINK      = (255, 240, 243)
PINK_DEEP = (255, 226, 232)
INK       = (20, 22, 26)
MUTED     = (107, 114, 128)
LINE      = (236, 236, 239)
WHITE     = (255, 255, 255)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
def font(px, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"{FONT_DIR}/{name}", px)

# Colour words the catalogue uses, mapped to something a person would accept as that colour.
COLORS = {
    "black": (28, 28, 30), "midnight": (28, 32, 42), "obsidian": (32, 32, 34),
    "space black": (38, 38, 40), "graphite": (58, 58, 62), "titanium black": (48, 46, 46),
    "grey": (128, 130, 134), "gray": (128, 130, 134), "lunar grey": (118, 120, 126),
    "space grey": (108, 110, 116), "titanium grey": (140, 138, 134), "silver": (208, 210, 214),
    "white": (245, 245, 247), "porcelain": (238, 234, 228), "starlight": (243, 238, 228),
    "frost": (228, 236, 244), "beige": (226, 214, 196), "natural": (200, 190, 176),
    "desert": (206, 184, 158), "sand": (214, 196, 170), "gold": (222, 190, 130),
    "blue": (48, 96, 190), "navy": (32, 50, 96), "titanium blue": (86, 108, 140),
    "indigo": (72, 78, 170), "teal": (40, 148, 148), "jade": (52, 148, 116),
    "jade cyan": (60, 168, 160), "green": (52, 148, 92), "olive": (118, 126, 84),
    "mint": (168, 220, 196), "lemon": (238, 226, 120), "yellow": (240, 200, 60),
    "pink": (238, 150, 176), "peony": (232, 140, 168), "rose": (226, 158, 168),
    "purple": (128, 96, 190), "lavender": (186, 170, 226), "hazel": (176, 150, 118),
    "clear": (222, 228, 236), "one size": (150, 152, 158),
}
def color_of(name, default=(58, 58, 62)):
    if not name:
        return default
    k = name.strip().lower()
    if k in COLORS:
        return COLORS[k]
    for word, rgb in COLORS.items():          # longest word wins, so "titanium blue" beats "blue"
        pass
    best = None
    for word, rgb in sorted(COLORS.items(), key=lambda kv: -len(kv[0])):
        if word in k:
            best = rgb
            break
    return best or default


def vgrad(size, top, bottom):
    w, h = size
    g = Image.new("RGB", (1, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        d.point((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((w, h), Image.BILINEAR)


def dgrad(size, a, b):
    """Diagonal gradient, the shape the hero and card headers use."""
    w, h = size
    base = Image.new("RGB", (w, h), b)
    d = ImageDraw.Draw(base)
    steps = w + h
    for i in range(steps + 1):
        t = i / steps
        c = tuple(round(a[j] + (b[j] - a[j]) * t) for j in range(3))
        d.line([(i - h, h), (i, 0)], fill=c, width=3)
    return base


def shadow(canvas, box, radius=48, blur=26, alpha=52):
    lay = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(lay).rounded_rectangle(box, radius=radius, fill=alpha)
    lay = lay.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(Image.new("RGB", canvas.size, (120, 90, 96)), (0, 0), lay)


def fit_text(draw, text, box_w, px, bold=True, min_px=18):
    f = font(px, bold)
    while px > min_px and draw.textlength(text, font=f) > box_w:
        px -= 2
        f = font(px, bold)
    return f


def centered(draw, text, cx, y, px, fill, bold=True, max_w=None):
    f = fit_text(draw, text, max_w or 10 ** 6, px, bold)
    w = draw.textlength(text, font=f)
    draw.text((cx - w / 2, y), text, font=f, fill=fill)
    return f.size


# =========================================================================================
# Form factors. Each draws on a 1600x1600 canvas already carrying its background.
# =========================================================================================
S = 1600

def _phone_body(d, cx, cy, w, h, body, radius=None):
    r = radius or int(w * 0.14)
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], radius=r, fill=body)
    ir = int(r * 0.82)
    inset = int(w * 0.035)
    screen = tuple(max(0, c - 14) for c in body)
    d.rounded_rectangle([cx - w // 2 + inset, cy - h // 2 + inset,
                         cx + w // 2 - inset, cy + h // 2 - inset], radius=ir, fill=screen)
    # glass sheen, the thing that stops a flat rectangle reading as a placeholder
    d.polygon([(cx - w // 2 + inset, cy + h // 2 - inset),
               (cx - w // 6, cy - h // 2 + inset),
               (cx + w // 8, cy - h // 2 + inset),
               (cx - w // 2 + inset, cy + h // 4)],
              fill=tuple(min(255, c + 26) for c in screen))


def draw_phone(img, d, body):
    w, h = int(S * 0.30), int(S * 0.60)
    cx, cy = S // 2, int(S * 0.46)
    shadow(img, [cx - w // 2 + 16, cy - h // 2 + 40, cx + w // 2 + 16, cy + h // 2 + 46])
    _phone_body(d, cx, cy, w, h, body)
    # camera island
    iw, ih = int(w * 0.42), int(w * 0.42)
    ix, iy = cx - w // 2 + int(w * 0.09), cy - h // 2 + int(w * 0.09)
    d.rounded_rectangle([ix, iy, ix + iw, iy + ih], radius=int(iw * 0.3),
                        fill=tuple(max(0, c - 26) for c in body))
    for k in range(2):
        lx = ix + int(iw * 0.28) + k * int(iw * 0.42)
        ly = iy + int(ih * 0.30) + k * int(ih * 0.26)
        d.ellipse([lx - 22, ly - 22, lx + 22, ly + 22], fill=(16, 16, 18))
        d.ellipse([lx - 9, ly - 9, lx + 9, ly + 9], fill=(64, 78, 96))


def draw_tablet(img, d, body):
    w, h = int(S * 0.46), int(S * 0.60)
    cx, cy = S // 2, int(S * 0.46)
    shadow(img, [cx - w // 2 + 16, cy - h // 2 + 40, cx + w // 2 + 16, cy + h // 2 + 46])
    _phone_body(d, cx, cy, w, h, body, radius=int(w * 0.07))
    d.ellipse([cx + w // 2 - 66, cy - h // 2 + 34, cx + w // 2 - 34, cy - h // 2 + 66],
              fill=(16, 16, 18))


def draw_watch(img, d, body):
    cx, cy = S // 2, int(S * 0.46)
    w, h = int(S * 0.26), int(S * 0.30)
    strap = tuple(max(0, c - 30) for c in body)
    d.rounded_rectangle([cx - w // 4, cy - int(h * 0.98), cx + w // 4, cy + int(h * 0.98)],
                        radius=int(w * 0.16), fill=strap)
    shadow(img, [cx - w // 2 + 12, cy - h // 2 + 30, cx + w // 2 + 12, cy + h // 2 + 36], radius=60)
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
                        radius=int(w * 0.30), fill=body)
    d.rounded_rectangle([cx - w // 2 + 22, cy - h // 2 + 22, cx + w // 2 - 22, cy + h // 2 - 22],
                        radius=int(w * 0.24), fill=(22, 22, 26))
    d.rounded_rectangle([cx + w // 2 - 6, cy - 34, cx + w // 2 + 12, cy + 34], radius=9, fill=strap)
    f = font(52)
    d.text((cx - d.textlength("10:09", font=f) / 2, cy - 30), "10:09", font=f, fill=(240, 240, 245))


def draw_earbuds(img, d, body):
    cx, cy = S // 2, int(S * 0.47)
    cw, ch = int(S * 0.30), int(S * 0.24)
    shadow(img, [cx - cw // 2 + 12, cy + 30, cx + cw // 2 + 12, cy + ch + 40], radius=70)
    d.rounded_rectangle([cx - cw // 2, cy, cx + cw // 2, cy + ch], radius=int(ch * 0.34), fill=body)
    d.line([cx - cw // 2 + 20, cy + int(ch * 0.42), cx + cw // 2 - 20, cy + int(ch * 0.42)],
           fill=tuple(max(0, c - 24) for c in body), width=5)
    for sx in (-1, 1):
        bx = cx + sx * int(cw * 0.40)
        by = cy - int(ch * 1.00)
        d.rounded_rectangle([bx - 26, by + 30, bx + 26, by + 210], radius=26, fill=body)
        d.ellipse([bx - 74, by - 74, bx + 74, by + 74], fill=body)
        d.ellipse([bx - 34, by - 34, bx + 34, by + 34], fill=tuple(max(0, c - 34) for c in body))


def draw_router(img, d, body):
    cx, cy = S // 2, int(S * 0.50)
    w, h = int(S * 0.30), int(S * 0.34)
    for sx, lean in ((-1, -14), (1, 14)):
        d.line([cx + sx * int(w * 0.28), cy - h // 2,
                cx + sx * int(w * 0.28) + lean * 9, cy - h // 2 - 210], fill=body, width=26)
        d.ellipse([cx + sx * int(w * 0.28) + lean * 9 - 15, cy - h // 2 - 225,
                   cx + sx * int(w * 0.28) + lean * 9 + 15, cy - h // 2 - 195], fill=body)
    shadow(img, [cx - w // 2 + 12, cy - h // 2 + 26, cx + w // 2 + 12, cy + h // 2 + 34], radius=44)
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
                        radius=int(w * 0.10), fill=body)
    for i in range(3):
        lx = cx - 74 + i * 74
        d.ellipse([lx - 11, cy + 60, lx + 11, cy + 82], fill=(90, 220, 140) if i < 2 else RED_HOT)
    for i in range(3):
        d.arc([cx - 60 - i * 40, cy - 118 - i * 40, cx + 60 + i * 40, cy + 2 - i * 40],
              start=210, end=330, fill=WHITE, width=9)


def draw_powerbank(img, d, body):
    cx, cy = S // 2, int(S * 0.47)
    w, h = int(S * 0.26), int(S * 0.42)
    shadow(img, [cx - w // 2 + 12, cy - h // 2 + 30, cx + w // 2 + 12, cy + h // 2 + 38], radius=50)
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
                        radius=int(w * 0.18), fill=body)
    for i in range(4):
        lx = cx - 66 + i * 44
        d.rounded_rectangle([lx - 9, cy + h // 2 - 90, lx + 9, cy + h // 2 - 58], radius=5,
                            fill=(90, 220, 140) if i < 3 else tuple(max(0, c - 40) for c in body))
    d.rounded_rectangle([cx - 34, cy - h // 2 + 56, cx + 34, cy - h // 2 + 88], radius=14,
                        fill=tuple(max(0, c - 40) for c in body))


def draw_charger(img, d, body):
    cx, cy = S // 2, int(S * 0.46)
    w = int(S * 0.24)
    shadow(img, [cx - w // 2 + 12, cy - w // 2 + 28, cx + w // 2 + 12, cy + w // 2 + 36], radius=52)
    d.rounded_rectangle([cx - w // 2, cy - w // 2, cx + w // 2, cy + w // 2],
                        radius=int(w * 0.26), fill=body)
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * 40 - 13, cy - w // 2 - 96, cx + sx * 40 + 13, cy - w // 2 + 8],
                            radius=7, fill=(196, 198, 204))
    d.rounded_rectangle([cx - 44, cy + w // 2 - 34, cx + 44, cy + w // 2 + 2], radius=12,
                        fill=tuple(max(0, c - 34) for c in body))
    d.line([cx, cy + w // 2, cx, cy + w // 2 + 190], fill=(210, 212, 218), width=20)


def draw_case(img, d, body):
    w, h = int(S * 0.30), int(S * 0.58)
    cx, cy = S // 2, int(S * 0.46)
    shadow(img, [cx - w // 2 + 14, cy - h // 2 + 34, cx + w // 2 + 14, cy + h // 2 + 42])
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
                        radius=int(w * 0.16), fill=body)
    inset = int(w * 0.07)
    d.rounded_rectangle([cx - w // 2 + inset, cy - h // 2 + inset,
                         cx + w // 2 - inset, cy + h // 2 - inset],
                        radius=int(w * 0.12), outline=tuple(max(0, c - 26) for c in body), width=8)
    iw = int(w * 0.44)
    ix, iy = cx - w // 2 + int(w * 0.10), cy - h // 2 + int(w * 0.10)
    d.rounded_rectangle([ix, iy, ix + iw, iy + iw], radius=int(iw * 0.3), fill=PINK_DEEP)


def draw_screen(img, d, body):
    w, h = int(S * 0.28), int(S * 0.54)
    cx, cy = S // 2, int(S * 0.46)
    shadow(img, [cx - w // 2 + 14, cy - h // 2 + 30, cx + w // 2 + 14, cy + h // 2 + 38])
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
                        radius=int(w * 0.12), fill=(226, 232, 240), outline=(196, 204, 214), width=6)
    d.polygon([(cx - w // 2, cy + h // 2), (cx - w // 8, cy - h // 2),
               (cx + w // 6, cy - h // 2), (cx - w // 2, cy + h // 6)], fill=(242, 246, 250))


def draw_sim(img, d, body, esim=False):
    cx, cy = S // 2, int(S * 0.46)
    w, h = int(S * 0.34), int(S * 0.24)
    shadow(img, [cx - w // 2 + 12, cy - h // 2 + 26, cx + w // 2 + 12, cy + h // 2 + 34], radius=40)
    pts = [(cx - w // 2, cy - h // 2), (cx + w // 2 - 60, cy - h // 2), (cx + w // 2, cy - h // 2 + 60),
           (cx + w // 2, cy + h // 2), (cx - w // 2, cy + h // 2)]
    d.polygon(pts, fill=body)
    gx, gy, gw, gh = cx - w // 2 + 46, cy - h // 2 + 46, int(w * 0.32), int(h * 0.50)
    d.rounded_rectangle([gx, gy, gx + gw, gy + gh], radius=12, fill=(226, 190, 96))
    for i in range(3):
        d.line([gx, gy + gh * (i + 1) / 4, gx + gw, gy + gh * (i + 1) / 4], fill=body, width=5)
    d.line([gx + gw / 2, gy, gx + gw / 2, gy + gh], fill=body, width=5)
    if esim:
        f = font(64)
        d.text((cx + 40, cy - 34), "eSIM", font=f, fill=WHITE)


def draw_plan_card(img, d, meta):
    """The tariff card: red gradient header, black price pill, USSD tiles as
    small white squares, pale pink body with the allowance lines."""
    x0, y0, x1, y1 = int(S * 0.12), int(S * 0.13), int(S * 0.88), int(S * 0.87)
    shadow(img, [x0 + 14, y0 + 26, x1 + 14, y1 + 34], radius=46)
    card = Image.new("RGB", (x1 - x0, y1 - y0), PINK)
    head_h = int((y1 - y0) * 0.42)
    card.paste(dgrad((x1 - x0, head_h), RED_HOT, RED), (0, 0))
    cd = ImageDraw.Draw(card)
    cd.text((44, 34), "Tariff", font=font(40, False), fill=(255, 214, 222))
    name = meta["title"]
    pill_f = fit_text(cd, name.upper(), (x1 - x0) - 150, 78)
    pw = cd.textlength(name.upper(), font=pill_f)
    cd.polygon([(40, 104), (40 + pw + 60, 104), (40 + pw + 44, 104 + 90), (40, 104 + 90)],
               fill=(16, 16, 20))
    cd.text((60, 118), name.upper(), font=pill_f, fill=WHITE)
    price = f"{float(meta['price']):.2f}".rstrip("0").rstrip(".")
    cd.text((44, 224), f"${price}", font=font(74), fill=WHITE)
    per = f" / {meta.get('validity_days') or 28} days"
    cd.text((44 + cd.textlength(f'${price}', font=font(74)), 250), per, font=font(38, False),
            fill=(255, 220, 226))
    ussd = (meta.get("ussd_code") or "").strip("*#")
    if ussd:
        tx = 44
        for ch in ["*"] + list(ussd) + ["#"]:
            cd.rounded_rectangle([tx, 330, tx + 44, 380], radius=8, outline=WHITE, width=3)
            cd.text((tx + 22 - cd.textlength(ch, font=font(30)) / 2, 344), ch,
                    font=font(30), fill=WHITE)
            tx += 54
    ly = head_h + 46
    lines = [l.strip() for l in meta["description"].split(",")][:5]
    for line in lines:
        cd.ellipse([48, ly + 6, 78, ly + 36], outline=RED, width=5)
        cd.text((100, ly), line[:34], font=font(40, False), fill=INK)
        ly += 70
    cd.rounded_rectangle([48, y1 - y0 - 110, (x1 - x0) // 2 - 12, y1 - y0 - 34], radius=14,
                         outline=RED, width=4)
    cd.text((48 + ((x1 - x0) // 2 - 60 - cd.textlength("More", font=font(38))) / 2,
             y1 - y0 - 92), "More", font=font(38), fill=RED)
    cd.rounded_rectangle([(x1 - x0) // 2 + 12, y1 - y0 - 110, (x1 - x0) - 48, y1 - y0 - 34],
                         radius=14, fill=RED)
    cd.text(((x1 - x0) // 2 + 12 + ((x1 - x0) // 2 - 60 - cd.textlength("Join now", font=font(38))) / 2,
             y1 - y0 - 92), "Join now", font=font(38), fill=WHITE)
    img.paste(card, (x0, y0))
    return True


def draw_pack(img, d, meta, label, sub):
    """A data ring, filled in proportion to the allowance, which reads instantly as a bundle."""
    cx, cy, r = S // 2, int(S * 0.44), int(S * 0.20)
    d.ellipse([cx - r - 26, cy - r - 26, cx + r + 26, cy + r + 26], fill=PINK_DEEP)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    gb = meta.get("data_gb")
    frac = 0.62 if not gb else max(0.18, min(1.0, math.log10(float(gb) + 1) / math.log10(41)))
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=-90 + int(360 * frac),
          fill=RED, width=42)
    centered(d, label, cx, cy - 62, 108, INK, max_w=int(r * 1.7))
    centered(d, sub, cx, cy + 54, 44, MUTED, bold=False, max_w=int(r * 1.7))


def draw_globe(img, d, meta):
    cx, cy, r = S // 2, int(S * 0.44), int(S * 0.21)
    d.ellipse([cx - r - 24, cy - r - 24, cx + r + 24, cy + r + 24], fill=PINK_DEEP)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=RED, width=10)
    for i in range(1, 4):
        rr = int(r * i / 4)
        d.ellipse([cx - r, cy - rr, cx + r, cy + rr], outline=(240, 170, 186), width=6)
    d.line([cx, cy - r, cx, cy + r], fill=(240, 170, 186), width=6)
    d.arc([cx - int(r * 0.55), cy - r, cx + int(r * 0.55), cy + r], 0, 360,
          fill=(240, 170, 186), width=6)
    px, py = cx + int(r * 0.42), cy - int(r * 0.30)
    d.ellipse([px - 26, py - 34, px + 26, py + 18], fill=RED)
    d.polygon([(px - 17, py + 10), (px + 17, py + 10), (px, py + 48)], fill=RED)
    d.ellipse([px - 9, py - 17, px + 9, py + 1], fill=WHITE)


def draw_glyph(img, d, meta, letters):
    cx, cy, r = S // 2, int(S * 0.44), int(S * 0.20)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED)
    centered(d, letters, cx, cy - 74, 150, WHITE, max_w=int(r * 1.5))


def draw_fiber(img, d, meta, mbps=None):
    cx, cy = S // 2, int(S * 0.44)
    for i, amp in enumerate((150, 100, 52)):
        pts = []
        for x in range(cx - 380, cx + 381, 8):
            t = (x - (cx - 380)) / 760
            pts.append((x, cy + amp * math.sin(t * math.pi * 2.4 + i * 0.7) * (1 - t * 0.55)))
        d.line(pts, fill=(RED, RED_HOT, (255, 150, 170))[i], width=(20, 14, 10)[i], joint="curve")
    if mbps:
        centered(d, f"{mbps}", cx, cy + 190, 130, INK)
        centered(d, "Mbps", cx, cy + 322, 48, MUTED, bold=False)


def draw_bundle(img, d, meta, body=(58, 58, 62)):
    cx, cy = S // 2, int(S * 0.45)
    d.rounded_rectangle([cx - 300, cy - 210, cx - 30, cy + 210], radius=44, fill=PINK_DEEP)
    _phone_body(d, cx - 165, cy, 230, 400, body)
    card = Image.new("RGB", (300, 380), PINK)
    ImageDraw.Draw(card).rectangle([0, 0, 300, 150], fill=RED)
    cd = ImageDraw.Draw(card)
    cd.text((22, 44), "PLAN", font=font(52), fill=WHITE)
    for i in range(3):
        cd.line([24, 196 + i * 52, 276, 196 + i * 52], fill=(236, 200, 208), width=10)
    img.paste(card, (cx + 40, cy - 190))
    d.ellipse([cx - 30, cy - 58, cx + 86, cy + 58], fill=WHITE, outline=RED, width=9)
    centered(d, "+", cx + 28, cy - 62, 104, RED)


# =========================================================================================
# Compose one catalogue tile
# =========================================================================================
def mark(d, x, y, px=34, color=None):
    """The D-TELCO mark, which replaces the operator logo on every surface."""
    f = font(px)
    d.text((x, y), "D", font=f, fill=color or RED)
    w = d.textlength("D", font=f)
    d.ellipse([x + w + 5, y + px * 0.52, x + w + 5 + px * 0.20, y + px * 0.52 + px * 0.20],
              fill=color or RED)
    d.text((x + w + px * 0.20 + 12, y), "TELCO", font=f, fill=color or INK)


def tile(meta, color_name=None):
    img = vgrad((S, S), (255, 250, 251), (255, 236, 240))
    d = ImageDraw.Draw(img)
    body = color_of(color_name, (58, 58, 62))
    t, cat, tags = meta["product_type"], meta["category_path"], set(meta["tags"])
    drew_own_text = False

    if t == "plan":
        drew_own_text = draw_plan_card(img, d, meta)
    elif cat == "Shop>Phones":
        draw_phone(img, d, body)
    elif cat == "Shop>Tablets":
        draw_tablet(img, d, body)
    elif cat == "Shop>Wearables":
        draw_watch(img, d, body)
    elif cat in ("Shop>Routers and modems", "Home>Devices"):
        draw_router(img, d, body)
    elif t == "accessory":
        kind = next((k for k in ("case", "charger", "earbuds", "powerbank", "screen") if k in tags), "case")
        {"case": draw_case, "screen": draw_screen, "charger": draw_charger,
         "earbuds": draw_earbuds, "powerbank": draw_powerbank}[kind](img, d, body)
    elif t == "roaming":
        draw_globe(img, d, meta)
    elif t in ("sim", "esim", "number"):
        draw_sim(img, d, RED if t == "number" else (48, 52, 60), esim=(t == "esim"))
    elif t == "service":
        draw_glyph(img, d, meta, "".join(w[0] for w in meta["title"].split()[:2]).upper())
    elif t == "bundle":
        draw_bundle(img, d, meta, body)
    elif t == "fixed":
        draw_fiber(img, d, meta, meta.get("speed_mbps"))
    else:  # internet and add-on packs
        gb, sms, mins = meta.get("data_gb"), meta.get("sms"), meta.get("minutes")
        if gb:
            label, sub = (f"{float(gb):g} GB", f"{meta.get('validity_days') or 28} days")
        elif sms:
            label, sub = (f"{sms}", "SMS")
        elif mins:
            label, sub = ("UNL" if mins >= 99999 else f"{mins}", "minutes")
        else:
            label, sub = ("ON", "your line")
        draw_pack(img, d, meta, label, sub)

    if not drew_own_text:
        title = meta["title"] if not color_name or color_name == "One size" \
            else f"{meta['title']} {color_name}"
        centered(d, title, S // 2, int(S * 0.795), 64, INK, max_w=int(S * 0.84))
        sub = meta["brand"] if meta["brand"] != "D·TELCO" else meta["category_path"].split(">")[-1]
        centered(d, sub, S // 2, int(S * 0.885), 40, MUTED, bold=False, max_w=int(S * 0.7))
    mark(d, 56, S - 84, 34)
    d.text((S - 300, S - 76), "demo catalogue", font=font(28, False), fill=(214, 180, 190))
    return img


def save_sizes(img, outdir, slug, sizes=SIZES, quality=88):
    os.makedirs(outdir, exist_ok=True)
    for s in sizes:
        w = s
        h = round(img.height * s / img.width)
        im = img.resize((w, h), Image.LANCZOS)
        im.save(f"{outdir}/{slug}-{s}.jpg", "JPEG", quality=quality, optimize=True,
                progressive=True)


# =========================================================================================
# Editorial and brand
# =========================================================================================
def editorial(name, headline, kicker, kind):
    W, H = 2400, 1000
    if kind == "hero":
        img = dgrad((W, H), RED_DEEP, RED_HOT)
        d = ImageDraw.Draw(img)
        for i, (cx, cy, r) in enumerate(((1750, 300, 190), (2060, 620, 140), (1520, 720, 110))):
            d.rounded_rectangle([cx - r, cy - r, cx + r, cy + r], radius=int(r * 0.34),
                                fill=(24, 24, 28) if i % 2 == 0 else (250, 250, 252))
            g = "AI" if i == 0 else ("5G" if i == 1 else "eS")
            f = font(int(r * 0.7))
            d.text((cx - d.textlength(g, font=f) / 2, cy - r * 0.42), g, font=f,
                   fill=WHITE if i % 2 == 0 else RED)
        f = font(48, False)
        d.text((120, 240), kicker.upper(), font=f, fill=(255, 190, 202))
        for i, line in enumerate(headline.split("|")):
            lf = fit_text(d, line, 1250, 132)
            tw = d.textlength(line, font=lf)
            d.polygon([(104, 330 + i * 168), (104 + tw + 96, 330 + i * 168),
                       (104 + tw + 68, 330 + i * 168 + 138), (104, 330 + i * 168 + 138)],
                      fill=RED_HOT)
            d.text((136, 348 + i * 168), line, font=lf, fill=WHITE)
        mark(d, 120, 120, 54, WHITE)
    else:
        img = vgrad((W, H), (255, 248, 250), (255, 232, 238))
        d = ImageDraw.Draw(img)
        for i in range(7):
            x = 1420 + (i % 4) * 250
            y = 180 + (i // 4) * 330
            d.rounded_rectangle([x, y, x + 190, y + 250], radius=32,
                                fill=PINK_DEEP if i % 2 else (255, 255, 255))
        d.text((120, 300), kicker.upper(), font=font(40, False), fill=RED)
        for i, line in enumerate(headline.split("|")):
            lf = fit_text(d, line, 1180, 104)
            d.text((120, 380 + i * 128), line, font=lf, fill=INK)
        mark(d, 120, 140, 50)
    return img


def push_image(name, headline, sub):
    """2:1, the ratio the integration guide measured as the one that crops well in a notification. JPEG, and
    never AVIF, which no notification or mail client decodes."""
    W, H = 1200, 600
    img = dgrad((W, H), RED_DEEP, RED_HOT)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([742, 96, 1098, 504], radius=54, fill=RED_DEEP)
    _phone_body(ImageDraw.Draw(img), 920, 300, 210, 380, (28, 28, 32))
    f = fit_text(d, headline, 620, 84)
    d.text((90, 210), headline, font=f, fill=WHITE)
    d.text((90, 320), sub, font=font(44, False), fill=(255, 206, 216))
    mark(d, 90, 90, 44, WHITE)
    return img


def brand_assets():
    os.makedirs(OUT_BRAND, exist_ok=True)
    for px in (180, 192, 512):
        im = Image.new("RGB", (px, px), RED)
        d = ImageDraw.Draw(im)
        f = font(int(px * 0.52))
        d.text((px * 0.5 - d.textlength("D", font=f) / 2, px * 0.22), "D", font=f, fill=WHITE)
        d.ellipse([px * 0.60, px * 0.52, px * 0.60 + px * 0.11, px * 0.52 + px * 0.11], fill=WHITE)
        im.save(f"{OUT_BRAND}/icon-{px}.png", "PNG", optimize=True)
    im = Image.new("RGB", (512, 512), RED)          # maskable keeps its glyph inside the safe area
    d = ImageDraw.Draw(im)
    f = font(200)
    d.text((256 - d.textlength("D", font=f) / 2, 150), "D", font=f, fill=WHITE)
    im.save(f"{OUT_BRAND}/icon-512-maskable.png", "PNG", optimize=True)
    wm = Image.new("RGB", (1200, 300), WHITE)
    mark(ImageDraw.Draw(wm), 40, 90, 150)
    wm.save(f"{OUT_BRAND}/wordmark.png", "PNG", optimize=True)
    fav = Image.new("RGB", (64, 64), RED)
    d = ImageDraw.Draw(fav)
    f = font(38)
    d.text((32 - d.textlength("D", font=f) / 2, 12), "D", font=f, fill=WHITE)
    fav.save(f"{OUT_BRAND}/favicon.png", "PNG", optimize=True)


EDITORIAL = [
    ("hero-ai",        "Internet for AI|from D·TELCO",   "free on every GO plan",      "hero"),
    ("hero-esim",      "Your number|on eSIM in minutes", "no shop, no waiting",        "hero"),
    ("hero-roaming",   "Travel with|your own number",    "packs for 3 zones",          "hero"),
    ("cat-phones",     "Phones on instalments",          "up to 18 months",            "flat"),
    ("cat-plans",      "Plans that grow|with you",       "prepaid and postpaid",       "flat"),
    ("cat-roaming",    "Roaming without|the bill shock", "before you fly",             "flat"),
    ("cat-home",       "Fiber at home",                  "up to 1 Gbps",               "flat"),
    ("cat-accessories","Everything for|your handset",    "cases, audio, power",        "flat"),
    ("cat-support",    "Help, when|you need it",         "chat, call, store",          "flat"),
    ("cat-services",   "Services on|your line",          "call, message, protect",     "flat"),
    ("promo-app",      "The D·TELCO app",                "on Android",                 "flat"),
    ("promo-family",   "One bill,|every line",           "family bundles",             "flat"),
]
PUSH = [
    ("usage-80",      "You are at 80 percent",  "GO 29.99 has 25 GB"),
    ("back-in-stock", "It is back in stock",    "the one you saved"),
    ("price-drop",    "The price just dropped", "on your saved handset"),
    ("roaming",       "Welcome to Turkiye",     "3 GB for 7 days"),
    ("low-balance",   "Balance running low",    "top up in one tap"),
    ("cart",          "Still in your basket",   "finish in 30 seconds"),
    ("upgrade",       "Your contract ends soon","trade up and keep the number"),
    ("welcome",       "Welcome to D·TELCO",     "set up your eSIM"),
]


def main():
    feed = json.load(open(f"{ROOT}/data/catalogue.json"))
    by_id = {p["product_id"]: p for p in feed["products"]}
    jobs = {}                                    # slug -> (product meta, colour name or None)
    for p in feed["products"]:
        jobs[p["image_slug"]] = (p, None)
    for v in feed["variants"]:
        if v["image_slug"] not in jobs:
            jobs[v["image_slug"]] = (by_id[v["product_id"]], v.get("color"))

    os.makedirs(OUT_CAT, exist_ok=True)
    for i, (slug, (meta, color)) in enumerate(sorted(jobs.items()), 1):
        save_sizes(tile(meta, color), OUT_CAT, slug)
        if i % 100 == 0:
            print(f"  catalogue {i}/{len(jobs)}")

    for name, headline, kicker, kind in EDITORIAL:
        save_sizes(editorial(name, headline, kicker, kind), OUT_ED, name,
                   sizes=(2400, 1600, 800), quality=86)
    os.makedirs(OUT_PUSH, exist_ok=True)
    for name, headline, sub in PUSH:
        push_image(name, headline, sub).save(f"{OUT_PUSH}/{name}.jpg", "JPEG", quality=86,
                                             optimize=True, progressive=True)
    brand_assets()

    # A16 layer 6: every message image over 20 KB, and the platform’s 200 KB ceiling for rich push.
    fails = []
    for f in sorted(os.listdir(OUT_PUSH)):
        kb = os.path.getsize(f"{OUT_PUSH}/{f}") / 1024
        if kb < 20:
            fails.append(f"push image under the 20 KB floor: {f} at {kb:.0f} KB")
        if kb > 200:
            fails.append(f"push image over the 200 KB ceiling: {f} at {kb:.0f} KB")
    missing = [s for s in jobs if not os.path.exists(f"{OUT_CAT}/{s}-1200.jpg")]
    if missing:
        fails.append(f"{len(missing)} catalogue images missing")
    for f in fails:
        print("FAIL", f)

    total = sum(os.path.getsize(os.path.join(dp, f))
                for d in (OUT_CAT, OUT_ED, OUT_PUSH, OUT_BRAND)
                for dp, _, fs in os.walk(d) for f in fs)
    print(f"catalogue tiles {len(jobs)} x {len(SIZES)} = {len(jobs) * len(SIZES)} files")
    print(f"editorial {len(EDITORIAL)} x 3, push {len(PUSH)}, brand 6")
    print(f"total on disk {total / 1024 / 1024:.1f} MB")
    print("checks " + ("all passed" if not fails else f"{len(fails)} FAILED"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
