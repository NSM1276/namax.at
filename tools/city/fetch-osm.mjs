// Downloads one city's venues (of the kinds we serve), district boundaries and house addresses from OpenStreetMap.
// Usage: node tools/city/fetch-osm.mjs [city=wien] [venues|districts|addresses|streets|stops ...]   (default: the first three)
// Writes the files named in tools/city/paths.mjs, e.g. data/raw/osm-graz.json, osm-graz-districts.json, osm-graz-addresses.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cityPaths, overpassQuery } from './paths.mjs';

const city = process.argv[2] || 'wien';
const paths = cityPaths(city);
const parts = process.argv.slice(3).length ? process.argv.slice(3) : ['venues', 'districts', 'addresses'];
const OUT = { venues: paths.osm, districts: paths.districts, addresses: paths.addresses, streets: paths.streets, stops: paths.stops };
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function fetchOne(query, out) {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'venue-facts-pipeline/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(590_000),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith('{')) {
        console.log(url, res.status, text.slice(0, 200).replace(/\s+/g, ' '));
        continue;
      }
      const json = JSON.parse(text);
      // A mirror whose areas are not built answers with nothing; another mirror may have them.
      if (!json.elements.length) { console.log(url, 'empty answer'); continue; }
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, text);
      console.log(out, url, 'ok', json.elements.length, 'elements, OSM base', json.osm3s?.timestamp_osm_base);
      return true;
    } catch (e) {
      console.log(url, 'error', e.message);
    }
  }
  return false;
}

let ok = true;
for (const part of parts) {
  if (!OUT[part]) { console.error('unknown part', part); process.exit(1); }
  const query = overpassQuery(readFileSync(`tools/city/queries/${part}.overpass`, 'utf8'), city);
  ok = (await fetchOne(query, OUT[part])) && ok;
}
process.exit(ok ? 0 : 1);
