#!/usr/bin/env python3
"""PNG stills from posters.mjs -> /assets/island/*.webp. Needs Pillow."""
from pathlib import Path
from PIL import Image
here = Path(__file__).resolve().parent
dst = here.parents[1] / 'assets' / 'island'
dst.mkdir(parents=True, exist_ok=True)
total = 0
for f in sorted((here / 'out').glob('still-*.png')):
    name = f.stem.replace('still-', '')
    im = Image.open(f).convert('RGB')
    if name == 'map':
        im = im.resize((512, 512), Image.LANCZOS)
        q = 80
    else:
        q = 78
    o = dst / f'{name}.webp'
    im.save(o, 'WEBP', quality=q, method=6)
    total += o.stat().st_size
    print(f'{o.name:14s} {im.size[0]}x{im.size[1]}  {o.stat().st_size / 1024:.0f} KB')
print(f'total {total / 1024:.0f} KB')
