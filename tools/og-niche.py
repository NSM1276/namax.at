# Link-preview copies of the niche pictures: v/_shared/niche/<name>.webp -> api/_lib/venues/og-niche/<name>.jpg (1200x630).
# The preview renderer cannot read webp, so og.mjs draws these JPEGs. Run again after adding or removing a niche picture.
import sys
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
src, dst = root / 'v/_shared/niche', root / 'api/_lib/venues/og-niche'
dst.mkdir(exist_ok=True)
names = {p.stem for p in src.glob('*.webp')}
for old in dst.glob('*.jpg'):
    if old.stem not in names: old.unlink()
for p in sorted(src.glob('*.webp')):
    im = ImageOps.fit(Image.open(p).convert('RGB'), (1200, 630), Image.LANCZOS, centering=(0.5, 0.5))
    im.save(dst / (p.stem + '.jpg'), quality=72, optimize=True, progressive=True)
print(len(names), 'pictures')
