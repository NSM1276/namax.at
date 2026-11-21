// Which of the 23 Vienna districts a venue lies in.

/** District number from a Vienna postcode 1XX0, or null. */
export function zipDistrict(zip) {
  const m = /^1(\d\d)0$/.exec(String(zip || '').trim());
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 23 ? d : null;
}

/**
 * Builds locate(lon, lat) → district number from Overpass boundary relations (out geom).
 * Uses the even-odd rule over every member segment, so outer and inner rings both count.
 */
export function makeDistrictLocator(relations) {
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
    return { ref: Number(r.tags.ref), segs, box: [minX, minY, maxX, maxY] };
  });
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

export const DISTRICT_NAMES = {
  1: 'Innere Stadt', 2: 'Leopoldstadt', 3: 'Landstraße', 4: 'Wieden', 5: 'Margareten', 6: 'Mariahilf',
  7: 'Neubau', 8: 'Josefstadt', 9: 'Alsergrund', 10: 'Favoriten', 11: 'Simmering', 12: 'Meidling',
  13: 'Hietzing', 14: 'Penzing', 15: 'Rudolfsheim-Fünfhaus', 16: 'Ottakring', 17: 'Hernals', 18: 'Währing',
  19: 'Döbling', 20: 'Brigittenau', 21: 'Floridsdorf', 22: 'Donaustadt', 23: 'Liesing',
};
