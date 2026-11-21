"""Download one country's places from Overture Maps into data/places/.

Usage: python tools/places/overture-download.py AT 2026-11-18.0
Overture places are CDLA-Permissive-2.0; keep attribution "© Overture Maps Foundation".
"""
import sys, time, duckdb

BBOX = {  # lon min, lon max, lat min, lat max (country plus a margin)
    'AT': (9.5, 17.2, 46.3, 49.1),
    'CH': (5.9, 10.5, 45.8, 47.9),
    'DE': (5.8, 15.1, 47.2, 55.1),
}

country, release = sys.argv[1].upper(), sys.argv[2]
x0, x1, y0, y1 = BBOX[country]
out = f"data/places/overture-{country.lower()}-{release[:10]}.parquet"
t = time.time()
con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
con.sql(f"""
copy (
  select id, names.primary as name, taxonomy.primary as category,
         taxonomy.alternates as categories_alt, basic_category,
         confidence, operating_status, websites, phones, socials, emails, brand,
         addresses[1].freeform as street, addresses[1].postcode as postcode,
         addresses[1].locality as city, addresses[1].country as country,
         (bbox.xmin + bbox.xmax) / 2 as lon, (bbox.ymin + bbox.ymax) / 2 as lat,
         sources
  from read_parquet('{src}', hive_partitioning=1)
  where bbox.xmin between {x0} and {x1} and bbox.ymin between {y0} and {y1}
    and addresses[1].country = '{country}'
) to '{out}' (format parquet, compression zstd)
""")
n = con.sql(f"select count(*) from '{out}'").fetchall()[0][0]
print(out, n, 'places', round(time.time() - t), 's')
