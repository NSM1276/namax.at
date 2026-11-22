// Page addresses (<slug>.namax.at) for venues from the city dataset.
import { RESERVED_SLUGS } from '../../api/_lib/venues/schema.mjs';
import { CITIES } from '../../api/_lib/venues/cities.mjs';

const MAP = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ı: 'i', ł: 'l', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', þ: 'th' };

function clean(text, max) {
  let s = String(text || '').toLowerCase().replace(/[äöüßıłøæœđðþ]/g, (c) => MAP[c]);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max);
  return s.replace(/-+$/, '');
}

/** Slug made from a venue name alone; '' when the name has no Latin letters or digits. */
export const slugBase = (name) => clean(name, 32);

const streetName = (street) => clean(String(street || '').replace(/\s+\d.*$/, ''), 24);

/**
 * venues: [{id, name, kind, district, street}] of one city → Map(id → slug).
 * Names used once keep the bare name. In Vienna, names shared by several venues get the district number, and names
 * shared inside one district get the street too (those slugs never change). In other cities a name already used by
 * another page, or shared inside the city, gets the city ("pizza-roma-graz"); shared inside the city also the district
 * name, and inside one district the street. `taken` holds every slug already in use, in every city.
 */
export function assignSlugs(venues, taken = new Set(), { city = 'wien' } = {}) {
  const vienna = city === 'wien';
  const base = new Map();
  for (const v of venues) {
    let b = slugBase(v.name);
    if (!b) b = clean(`${v.kind} ${streetName(v.street)} ${vienna ? v.district : city}`, 40);
    else if (b.length < 3 || RESERVED_SLUGS.includes(b)) b = clean(`${b} ${v.kind}`, 40);
    base.set(v.id, b);
  }
  const count = (key) => { const m = new Map(); for (const v of venues) { const k = key(v); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const byBase = count((v) => base.get(v.id));
  const byBaseDistrict = count((v) => base.get(v.id) + '|' + v.district);
  const dName = (d) => clean(CITIES[city]?.districts?.[d] || String(d), 20);

  const used = new Set([...taken, ...RESERVED_SLUGS]);
  const out = new Map();
  for (const v of venues) {
    const b = base.get(v.id);
    let s = b;
    if (vienna) {
      if (byBase.get(b) > 1 || used.has(s)) s = `${b}-${v.district}`;
      if (byBaseDistrict.get(b + '|' + v.district) > 1) s = clean(`${b} ${v.district} ${streetName(v.street)}`, 40);
    } else if (byBaseDistrict.get(b + '|' + v.district) > 1) {
      s = clean(`${b} ${city} ${dName(v.district)} ${streetName(v.street)}`, 40);
    } else if (byBase.get(b) > 1) {
      s = clean(`${b} ${city} ${dName(v.district)}`, 40);
    } else if (used.has(s)) {
      s = clean(`${b} ${city}`, 40);
    }
    let n = 2, candidate = s;
    while (used.has(candidate)) candidate = `${s.slice(0, 37).replace(/-+$/, '')}-${n++}`;
    used.add(candidate);
    out.set(v.id, candidate);
  }
  return out;
}
