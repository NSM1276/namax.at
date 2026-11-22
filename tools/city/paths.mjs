// Where each city's downloads and dataset live. Vienna keeps the file names it had before there were other cities.
import { CITIES } from '../../api/_lib/venues/cities.mjs';

export function cityPaths(city) {
  if (!CITIES[city]) throw new Error(`unknown city "${city}" (known: ${Object.keys(CITIES).join(', ')})`);
  const w = city === 'wien';
  const dir = w ? 'data/city' : `data/cities/${city}`;
  return {
    osm: `data/raw/osm-${city}.json`,
    districts: w ? 'data/raw/osm-districts.json' : `data/raw/osm-${city}-districts.json`,
    addresses: w ? 'data/raw/osm-addresses.json' : `data/raw/osm-${city}-addresses.json`,
    overture: `data/places/overture-${city}.json`,
    dir,
    venues: `${dir}/venues.json`,
    excluded: `${dir}/excluded.json`,
    siteChecks: `${dir}/site-checks.json`,
    table: w ? 'docs/leads/city-table.md' : `docs/leads/city-table-${city}.md`,
  };
}

/** An Overpass query template with {{AREA}} (the city's area id) and {{LEVEL}} (its district admin_level) filled in. */
export const overpassQuery = (template, city) => template
  .replaceAll('{{AREA}}', String(3600000000 + CITIES[city].osm))
  .replaceAll('{{LEVEL}}', String(CITIES[city].districtLevel));
