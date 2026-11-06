#!/usr/bin/env python3
"""Draws icon.png: a magnifying glass over a lightbulb. Original artwork.
Layers are composited with alpha_composite (PIL's polygon draw overwrites alpha)."""
from PIL import Image, ImageDraw
import math

S = 1024          # drawn large, shrunk to 256 for smooth edges
OUT = 256
BLUE, SLATE, GLASS, GLOW, GLOW_HI, METAL = (
    (90, 169, 238, 255), (47, 59, 76, 255), (150, 205, 245, 255),
    (255, 205, 60, 255), (255, 238, 150, 255), (120, 128, 140, 255))


def layer():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def bulb(cx, cy, k):
    """A bulb centred on (cx, cy) at scale k, on its own layer."""
    im = layer()
    d = ImageDraw.Draw(im)
    r = 170 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GLOW)
    d.polygon([(cx - 95 * k, cy + 120 * k), (cx + 95 * k, cy + 120 * k),
               (cx + 70 * k, cy + 215 * k), (cx - 70 * k, cy + 215 * k)], fill=GLOW)
    h = 70 * k
    d.ellipse([cx - 105 * k, cy - 110 * k, cx - 105 * k + h, cy - 110 * k + h], fill=GLOW_HI)
    for i, y in enumerate((215, 245, 275)):
        d.rounded_rectangle([cx - 78 * k, cy + y * k, cx + 78 * k, cy + (y + 22) * k],
                            radius=10 * k, fill=METAL)
    d.rounded_rectangle([cx - 30 * k, cy + 300 * k, cx + 30 * k, cy + 325 * k], radius=10 * k, fill=SLATE)
    w = max(2, int(10 * k))
    d.line([(cx - 40 * k, cy + 120 * k), (cx - 40 * k, cy + 5 * k)], fill=SLATE, width=w)
    d.line([(cx + 40 * k, cy + 120 * k), (cx + 40 * k, cy + 5 * k)], fill=SLATE, width=w)
    d.arc([cx - 40 * k, cy - 35 * k, cx + 40 * k, cy + 45 * k], 180, 360, fill=SLATE, width=w)
    return im


img = layer()
d = ImageDraw.Draw(img)
d.ellipse([0, 0, S - 1, S - 1], fill=BLUE)
d.ellipse([44, 44, S - 45, S - 45], fill=(255, 255, 255, 255))

# rays around the bulb
rays = layer()
rd = ImageDraw.Draw(rays)
bx, by = 400, 400
for a in range(-170, 11, 30):
    x0, y0 = bx + 215 * math.cos(math.radians(a)), by + 215 * math.sin(math.radians(a))
    x1, y1 = bx + 275 * math.cos(math.radians(a)), by + 275 * math.sin(math.radians(a))
    rd.line([(x0, y0), (x1, y1)], fill=GLOW, width=22)
img = Image.alpha_composite(img, rays)
img = Image.alpha_composite(img, bulb(bx, by, 1.0))

# lens: magnified bulb clipped to a circle, then the rim and handle
lx, ly, lr = 590, 560, 215
inner = layer()
ImageDraw.Draw(inner).ellipse([lx - lr, ly - lr, lx + lr, ly + lr], fill=(225, 240, 252, 255))
big = bulb(bx + (lx - bx) * 0.55 + 20, by + (ly - by) * 0.55 - 10, 1.55)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).ellipse([lx - lr, ly - lr, lx + lr, ly + lr], fill=255)
clipped = layer()
clipped.paste(big, (0, 0), mask)
inner = Image.alpha_composite(inner, clipped)
shine = layer()
ImageDraw.Draw(shine).arc([lx - lr + 30, ly - lr + 30, lx + lr - 30, ly + lr - 30], 200, 260,
                          fill=(255, 255, 255, 230), width=22)
inner = Image.alpha_composite(inner, shine)
img = Image.alpha_composite(img, inner)

ring = layer()
rg = ImageDraw.Draw(ring)
ang = math.radians(45)
hx0, hy0 = lx + lr * math.cos(ang), ly + lr * math.sin(ang)
hx1, hy1 = hx0 + 190 * math.cos(ang), hy0 + 190 * math.sin(ang)
rg.line([(hx0, hy0), (hx1, hy1)], fill=SLATE, width=70)
rg.ellipse([hx1 - 35, hy1 - 35, hx1 + 35, hy1 + 35], fill=SLATE)
rg.ellipse([lx - lr - 20, ly - lr - 20, lx + lr + 20, ly + lr + 20], outline=SLATE, width=40)
img = Image.alpha_composite(img, ring)

# keep everything inside the outer circle
clip = Image.new("L", (S, S), 0)
ImageDraw.Draw(clip).ellipse([0, 0, S - 1, S - 1], fill=255)
final = layer()
final.paste(img, (0, 0), clip)
final.resize((OUT, OUT), Image.LANCZOS).save("icon.png")
print("wrote icon.png")
