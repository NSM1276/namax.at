// Which district of its city a venue lies in.
import { CITIES, districtNumber } from '../../api/_lib/venues/cities.mjs';

/** District number from a Vienna postcode 1XX0, or null; other cities' post codes do not follow their districts. */
export function zipDistrict(zip, city = 'wien') {
  if (city !== 'wien') return null;
  const m = /^1(\d\d)0$/.exec(String(zip || '').trim());
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 23 ? d : null;
}

/**
 * Builds locate(lon, lat) → district number from Overpass boundary relations (out geom) of one city.
 * The number is the relation's ref (Vienna) or its name in the city's table (Graz); other boundaries are ignored.
 * Uses the even-odd rule over every member segment, so outer and inner rings both count.
 */
export function makeDistrictLocator(relations, city = 'wien') {
  const polys = relations.map((r) => {
    const segs = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of r.members || []) {
      const g = m.geometry || [];
      for (let i = 1; i < g.length; i++) {
        segs.push([g[i - 1].lon, g[i - 1].lat, g[i].lon, g[i].lat]);
        minX = Math.min(minX, g[i].lon); maxX = Math.max(maxX, g[i].lon);
        minY = Math.min(minY, g[i].lat); maxY = Math.max(maxY, g[i].lat);
      }
    }
    return { ref: districtNumber(city, r.tags), segs, box: [minX, minY, maxX, maxY] };
  }).filter((p) => p.ref != null);
  return function locate(x, y) {
    for (const p of polys) {
      const [a, b, c, d] = p.box;
      if (x < a || x > c || y < b || y > d) continue;
      let inside = false;
      for (const [x1, y1, x2, y2] of p.segs) {
        if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
      }
      if (inside) return p.ref;
    }
    return null;
  };
}

export const DISTRICT_NAMES = CITIES.wien.districts;
