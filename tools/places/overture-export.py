"""Write a compact JSON of Overture places for one area, for the venue build (Node cannot read parquet).

Usage: python tools/places/overture-export.py data/places/overture-at-2026-11-18.parquet wien 1010 1239
Writes data/places/overture-<area>.json: {"release": "...", "places": [{id, n, lat, lon, st, pc, s, c, cat, bc, ph, w, src}]}
  s = operating status: "open" | "permanently_closed" | "temporarily_closed" | null
"""
import json, re, sys, duckdb

src, area, pc_from, pc_to = sys.argv[1:5]
release = re.search(r'(\d{4}-\d{2}-\d{2})', src).group(1)
con = duckdb.connect()
rows = con.execute(f"""
  select id, name, round(lat, 6), round(lon, 6), street, postcode, operating_status,
         round(confidence, 2), category, basic_category, phones[1], websites[1],
         list_distinct(list_transform(sources, lambda s: s.dataset))
  from read_parquet(?) where postcode between ? and ? and name is not null
""", [src, pc_from, pc_to]).fetchall()
keys = ['id', 'n', 'lat', 'lon', 'st', 'pc', 's', 'c', 'cat', 'bc', 'ph', 'w', 'src']
places = [{k: v for k, v in zip(keys, r) if v is not None} for r in rows]
out = f'data/places/overture-{area}.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'release': release, 'places': places}, f, ensure_ascii=False, separators=(',', ':'))
print(out, len(places), 'places')
