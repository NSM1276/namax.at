// Downloads every venue of the kinds we serve inside Vienna from OpenStreetMap.
// Usage: node tools/city/fetch-osm.mjs [query=tools/city/queries/venues.overpass] [out=data/raw/osm-wien.json]
// Also: districts.overpass → data/raw/osm-districts.json, addresses.overpass → data/raw/osm-addresses.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const QUERY_FILE = process.argv[2] || 'tools/city/queries/venues.overpass';
const OUT = process.argv[3] || 'data/raw/osm-wien.json';
const QUERY = readFileSync(QUERY_FILE, 'utf8');
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

for (const url of MIRRORS) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'venue-facts-pipeline/1.0' },
      body: 'data=' + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(590_000),
    });
    const text = await res.text();
    if (!res.ok || !text.trimStart().startsWith('{')) {
      console.log(url, res.status, text.slice(0, 200).replace(/\s+/g, ' '));
      continue;
    }
    const json = JSON.parse(text);
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(url, 'ok', json.elements.length, 'elements, OSM base', json.osm3s?.timestamp_osm_base);
    process.exit(0);
  } catch (e) {
    console.log(url, 'error', e.message);
  }
}
process.exit(1);
