#!/usr/bin/env python3
"""Turns the island's source photographs into the three files the world loads
from /assets/island/tex/:

  flora.webp   4096 x 2048: on the left the plant sprites, placed exactly where
               flora.js keeps them in its atlas (SPR); on the right their masks
  ground.webp  768 x 4608: six seamless squares, one above the other
               (dirt, ground cover, forest floor, sand, rock, basalt)
  skin.webp    512 x 512: seamless reptile scales

    python3 _tools/world/textures.py <folder of source PNGs>

The sources are not in the repository (about 45 MB). They were generated, one
image each: cutouts on flat magenta (fern, cycad, conifer_bough, leaf_cluster,
bigleaf, tuft, conifer_tree, broadleaf_tree: "photographed flat like a
botanical specimen scan, even light, uniform #FF00FF background") and square
top-down material photographs (sand, dirt, forest_floor, groundcover, rock,
basalt, bark, scales: "seamless tileable, flat overcast light, detail at one
scale"). Any photographs of the same kind, under the same names, will do.

Needs Pillow only.
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageStat

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path(__file__).resolve().parents[2] / 'assets' / 'island' / 'tex'
AT = 2048
# name: (source, x, y, w, h, how it sits in its rectangle)   -- keep in step with SPR in src/flora.js
SPRITES = {
    'fern': ('fern', 0, 0, 384, 1024, 'tall'), 'palm': ('cycad', 384, 0, 384, 1024, 'tall'), 'needle': ('conifer_bough', 768, 0, 512, 1024, 'tall'),
    'leaf': ('leaf_cluster', 1280, 0, 768, 768, 'centre'), 'tuft': ('tuft', 0, 1024, 512, 512, 'foot'), 'big': ('bigleaf', 1024, 1024, 512, 512, 'foot'),
    'crown': ('broadleaf_tree', 1024, 1536, 512, 512, 'foot'), 'pine': ('conifer_tree', 1536, 1024, 512, 1024, 'tall'),
}
GROUND = ['dirt', 'groundcover', 'forest_floor', 'sand', 'rock', 'basalt']
LAYER = 768


def key(im):
    """Magenta out: returns RGBA with the spill taken off the edges."""
    r, g, b = im.convert('RGB').split()
    m = ImageChops.subtract(ImageChops.darker(r, b), g)                  # how magenta: min(r, b) - g
    alpha = m.point(lambda v: 255 - max(0, min(255, int((v - 26) * 255 / 70))))
    r = ImageChops.subtract(r, m); b = ImageChops.subtract(b, m)          # despill
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    return Image.merge('RGBA', (r, g, b, alpha))


def bleed(im, grow=3):
    """Colour pushed out past the edge (so mips never pull in the backdrop), mask thickened a little
    (fine see-through gaps turn to a dotted screen at a distance)."""
    a = im.getchannel('A')
    pre = im.convert('RGBa')
    soft = Image.new('RGB', im.size)
    for radius in (24, 10, 4):                                            # far fill first, nearer colour over it
        blur = pre.filter(ImageFilter.GaussianBlur(radius)).convert('RGBA')
        soft = Image.composite(blur.convert('RGB'), soft, blur.getchannel('A').point(lambda v: min(255, v * 6)))
    rgb = Image.composite(im.convert('RGB'), soft, a)
    return rgb, a.filter(ImageFilter.MaxFilter(grow)) if grow > 1 else a


def grade(rgb, bright=0.8, sat=0.9):
    return ImageEnhance.Color(ImageEnhance.Brightness(rgb).enhance(bright)).enhance(sat)


def fit(cut, w, h, how, pad=10):
    box = cut.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    cut = cut.crop(box)
    cw, ch = cut.size
    if how == 'tall':            # fills the height; squeezed sideways only as far as it must be
        s = (h - 2 * pad) / ch; nw = min(w - 2 * pad, round(cw * s)); nh = h - 2 * pad
    else:
        s = min((w - 2 * pad) / cw, (h - 2 * pad) / ch); nw, nh = round(cw * s), round(ch * s)
    small = cut.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = (w - nw) // 2
    y = (h - nh) // 2 if how == 'centre' else h - nh - pad
    out.paste(small, (x, y))
    return out


def seamless(im, size, flatten=True):
    """Tiles in both directions: each edge is cross-faded with the picture shifted by half."""
    im = im.convert('RGB')
    w, h = im.size
    if flatten:                  # take out the slow drift in brightness that makes a repeat show
        slow = im.filter(ImageFilter.GaussianBlur(w / 5))
        mean = [round(v) for v in ImageStat.Stat(im).mean]
        im = Image.merge('RGB', [ImageChops.subtract(c, s, 1, m) for c, s, m in zip(im.split(), slow.split(), mean)])
    for axis in (0, 1):
        shifted = ImageChops.offset(im, w // 2 if axis == 0 else 0, h // 2 if axis == 1 else 0)
        n = w if axis == 0 else h
        ramp = [0] * n
        for i in range(n):
            d = min(i, n - 1 - i) / (n * 0.22)                            # 0 at the edge, 1 once well inside
            t = max(0.0, min(1.0, d)); ramp[i] = round(255 * (1 - t * t * (3 - 2 * t)))
        line = Image.new('L', (n, 1)); line.putdata(ramp)
        mask = line.resize((w, h)) if axis == 0 else line.rotate(90, expand=True).resize((w, h))
        im = Image.composite(shifted, im, mask)
    return im.resize((size, size), Image.LANCZOS)


def main():
    if not SRC or not SRC.is_dir():
        sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    src = lambda n: Image.open(SRC / f'{n}.png')

    colour = Image.new('RGB', (AT, AT), (53, 80, 31)); mask = Image.new('L', (AT, AT), 0)
    for name, (file, x, y, w, h, how) in SPRITES.items():
        rgb, a = bleed(fit(key(src(file)), w, h, how), 3 if name in ('fern', 'palm', 'needle', 'pine', 'crown') else 1)
        edge = Image.new('L', (w, h), 0); edge.paste(255, (4, 4, w - 4, h - 4))
        colour.paste(grade(rgb), (x, y)); mask.paste(ImageChops.multiply(a, edge), (x, y))
        print(f'  {name:7s} <- {file}')
    # bark is opaque: the furrows run up the trunk, twice in its rectangle
    bark = grade(seamless(src('bark'), 512), 0.82, 0.85).resize((256, 512), Image.LANCZOS)
    for k in range(2): colour.paste(bark, (768, 1024 + 512 * k)); mask.paste(255, (768, 1024 + 512 * k, 1024, 1536 + 512 * k))
    # a cushion of ground cover with a ragged edge
    gc = seamless(src('groundcover'), 512)
    lum = gc.convert('L').filter(ImageFilter.GaussianBlur(5))
    disc = Image.radial_gradient('L').resize((512, 512))                  # 0 in the middle, 255 at the corners
    edge = ImageChops.add(disc, lum.point(lambda v: max(0, min(255, (v - 128) // 2 + 64))), 1, -64).point(lambda v: 255 if v < 150 else 0).filter(ImageFilter.GaussianBlur(1.5))
    colour.paste(grade(gc, 0.85, 0.9), (0, 1536)); mask.paste(edge, (0, 1536))
    sheet = Image.new('RGB', (AT * 2, AT)); sheet.paste(colour, (0, 0)); sheet.paste(Image.merge('RGB', (mask, mask, mask)), (AT, 0))
    sheet.save(OUT / 'flora.webp', quality=84, method=6)

    strip = Image.new('RGB', (LAYER, LAYER * len(GROUND)))
    for i, name in enumerate(GROUND):
        strip.paste(seamless(src(name), LAYER), (0, LAYER * i)); print(f'  ground {i} <- {name}')
    strip.save(OUT / 'ground.webp', quality=80, method=6)

    seamless(src('scales'), 512).save(OUT / 'skin.webp', quality=82, method=6)
    for f in sorted(OUT.glob('*.webp')): print(f'{f.name:14s} {f.stat().st_size / 1024:7.0f} KB  {Image.open(f).size}')


if __name__ == '__main__':
    main()
