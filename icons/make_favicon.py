"""
Generates the Ons Nest favicon: a simple nest-with-egg mark using the site's
existing brand colors (sea-deep background, sand nest, terracotta egg), drawn
at high resolution and downsampled for crisp small sizes.
"""
from PIL import Image, ImageDraw

SEA_DEEP = (37, 71, 90, 255)      # #25475A -- matches the site's CTA band
SAND = (245, 240, 228, 255)       # #F5F0E4 -- matches --sand
ROOF = (154, 82, 56, 255)         # #9A5238 -- matches --roof

SIZE = 512
SUPER = 4  # supersample factor for smooth edges

def make_master():
    s = SIZE * SUPER
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square background
    pad = int(s * 0.04)
    radius = int(s * 0.22)
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=SEA_DEEP)

    # Nest: a smooth ring (annulus) clipped to its bottom half, so it reads as
    # a clean woven bowl instead of a stack of stroked arcs with rough ends.
    cx, cy = s * 0.5, s * 0.565
    outer_w, outer_h = s * 0.60, s * 0.60
    thickness = s * 0.15

    ring = Image.new("L", (s, s), 0)
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - outer_w / 2, cy - outer_h / 2, cx + outer_w / 2, cy + outer_h / 2], fill=255)
    inner_w, inner_h = outer_w - thickness * 2, outer_h - thickness * 2
    rd.ellipse([cx - inner_w / 2, cy - inner_h / 2, cx + inner_w / 2, cy + inner_h / 2], fill=0)

    # Keep only the lower portion so it reads as a bowl, not a full ring.
    clip = Image.new("L", (s, s), 0)
    cd = ImageDraw.Draw(clip)
    cd.rounded_rectangle([0, cy - outer_h * 0.06, s, s], radius=thickness * 0.55, fill=255)
    ring = Image.composite(ring, Image.new("L", (s, s), 0), clip)

    nest_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    nest_layer.paste(Image.new("RGBA", (s, s), SAND), (0, 0), ring)
    img.alpha_composite(nest_layer)

    # Egg sitting in the nest
    egg_w, egg_h = s * 0.24, s * 0.29
    ex, ey = cx, cy - s * 0.08
    d.ellipse([ex - egg_w / 2, ey - egg_h / 2, ex + egg_w / 2, ey + egg_h / 2], fill=ROOF)

    return img.resize((SIZE, SIZE), Image.LANCZOS)

def main():
    master = make_master()
    master.save("icons/favicon-512.png")

    for size in (16, 32, 48, 180, 192):
        resized = master.resize((size, size), Image.LANCZOS)
        if size == 180:
            resized.save("icons/apple-touch-icon.png")
        elif size == 192:
            resized.save("icons/android-chrome-192.png")
        else:
            resized.save(f"icons/favicon-{size}.png")

    # Multi-size .ico for legacy browsers
    master.save(
        "icons/favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    print("done")

if __name__ == "__main__":
    main()
