// Cities with venue pages. A record's city is facts.internal.city; records from before there was more than one city are Vienna.
// osm: the city's boundary relation in OpenStreetMap; districtLevel: admin_level of its district boundaries inside it.
// districts: number → name, the city's own numbering. A city without a table cannot be built yet (tools/city/build-dataset.mjs).

export const CITIES = {
  wien: {
    name: 'Wien', osm: 109166, districtLevel: 9, zip: /^1(0[1-9]|1\d|2[0-3])0$/,
    districts: {
      1: 'Innere Stadt', 2: 'Leopoldstadt', 3: 'Landstraße', 4: 'Wieden', 5: 'Margareten', 6: 'Mariahilf',
      7: 'Neubau', 8: 'Josefstadt', 9: 'Alsergrund', 10: 'Favoriten', 11: 'Simmering', 12: 'Meidling',
      13: 'Hietzing', 14: 'Penzing', 15: 'Rudolfsheim-Fünfhaus', 16: 'Ottakring', 17: 'Hernals', 18: 'Währing',
      19: 'Döbling', 20: 'Brigittenau', 21: 'Floridsdorf', 22: 'Donaustadt', 23: 'Liesing',
    },
  },
  graz: {
    name: 'Graz', osm: 34719, districtLevel: 9, zip: /^80(1\d|2\d|3\d|4\d|5[0-5])$/, roman: true,
    districts: {
      1: 'Innere Stadt', 2: 'St. Leonhard', 3: 'Geidorf', 4: 'Lend', 5: 'Gries', 6: 'Jakomini', 7: 'Liebenau',
      8: 'St. Peter', 9: 'Waltendorf', 10: 'Ries', 11: 'Mariatrost', 12: 'Andritz', 13: 'Gösting', 14: 'Eggenberg',
      15: 'Wetzelsdorf', 16: 'Straßgang', 17: 'Puntigam',
    },
  },
  // Not opened yet: their district tables are filled in when each city's turn comes.
  linz: { name: 'Linz', osm: 86708, districtLevel: 9, zip: /^40[0-4]\d$/, districts: null },
  salzburg: { name: 'Salzburg', osm: 86538, districtLevel: 9, zip: /^50[0-3]\d$/, districts: null },
  innsbruck: { name: 'Innsbruck', osm: 4835169, districtLevel: 9, zip: /^60[0-2]\d$/, districts: null },
};
export const CITY_ORDER = ['wien', 'graz', 'linz', 'salzburg', 'innsbruck'];

/** The city key of a stored record's facts; 'wien' when it has none. */
export const cityOf = (facts) => {
  const c = facts?.internal?.city;
  return typeof c === 'string' && CITIES[c] ? c : 'wien';
};

/** City key for the town name on an address ("Graz" → 'graz'), or null. */
export function cityByName(name) {
  const n = String(name || '').trim().toLowerCase();
  return CITY_ORDER.find((k) => CITIES[k].name.toLowerCase() === n) || null;
}

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function toRoman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** The district number as the city writes it: "12" in Vienna, "III" in Graz. */
export const districtNo = (city, d) => (CITIES[city]?.roman ? toRoman(Number(d)) : String(d));

/** "12. Meidling", "III. Geidorf"; "N. Bezirk" when the name is unknown. */
export const districtLabel = (city, d) => `${districtNo(city, d)}. ${CITIES[city]?.districts?.[d] || 'Bezirk'}`;

const plain = (s) => String(s || '').toLowerCase().replace(/^sankt /, 'st. ').trim();

/** District number for an OSM boundary relation's tags: its numeric ref, else its name in the city's table. */
export function districtNumber(city, tags = {}) {
  if (/^\d+$/.test(String(tags.ref || ''))) return Number(tags.ref);
  const table = CITIES[city]?.districts || {};
  const hit = Object.entries(table).find(([, name]) => plain(name) === plain(tags.name));
  return hit ? Number(hit[0]) : null;
}
