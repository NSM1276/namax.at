# District illustrations -> transparent WebP masks for v/_shared/districts (black lines opaque, white paper transparent), 960px wide.
# Usage: python -I tools/icons/districts.py <design-library dir> <out dir> [sets, default district] [name prefix, e.g. graz-]
import sys, os, json
from PIL import Image, ImageOps
lib, out = sys.argv[1], sys.argv[2]
sets = sys.argv[3].split(',') if len(sys.argv) > 3 else ['district']
only = sys.argv[4] if len(sys.argv) > 4 else ''  # name prefix, e.g. graz-
os.makedirs(out, exist_ok=True)
L = json.load(open(os.path.join(lib, 'library.json'), encoding='utf8'))
tot = 0
for it in L['items']:
    if it['group'] not in sets or it['status'] == 'superseded' or not it['name'].startswith(only): continue
    g = ImageOps.grayscale(Image.open(os.path.join(lib, it['original'])))
    g = g.crop(ImageOps.invert(g).point(lambda p: 255 if p > 40 else 0).getbbox())   # trim white margins
    g.thumbnail((960, 960))
    a = ImageOps.invert(g).point(lambda p: 0 if p < 60 else 255 if p > 190 else int((p - 60) * 255 / 130))
    im = Image.new('LA', g.size, 0); im.putalpha(a)
    p = os.path.join(out, it['name'] + '.webp'); im.save(p, 'WEBP', quality=70, method=6)
    tot += os.path.getsize(p); print(it['name'], g.size, os.path.getsize(p) // 1024, 'KB')
print('total', tot // 1024, 'KB')
