// Page addresses (<slug>.namax.at) for venues from the city dataset.
import { RESERVED_SLUGS } from '../venues/schema.mjs';

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
 * venues: [{id, name, kind, district, street}] → Map(id → slug).
 * Names used once keep the bare name; names shared by several venues get the district,
 * and names shared inside one district get the street too. `taken` holds slugs already in use.
 */
export function assignSlugs(venues, taken = new Set()) {
  const base = new Map();
  for (const v of venues) {
    let b = slugBase(v.name);
    if (!b) b = clean(`${v.kind} ${streetName(v.street)} ${v.district}`, 40);
    else if (b.length < 3 || RESERVED_SLUGS.includes(b)) b = clean(`${b} ${v.kind}`, 40);
    base.set(v.id, b);
  }
  const count = (key) => { const m = new Map(); for (const v of venues) { const k = key(v); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const byBase = count((v) => base.get(v.id));
  const byBaseDistrict = count((v) => base.get(v.id) + '|' + v.district);

  const used = new Set([...taken, ...RESERVED_SLUGS]);
  const out = new Map();
  for (const v of venues) {
    const b = base.get(v.id);
    let s = b;
    if (byBase.get(b) > 1 || used.has(s)) s = `${b}-${v.district}`;
    if (byBaseDistrict.get(b + '|' + v.district) > 1) s = clean(`${b} ${v.district} ${streetName(v.street)}`, 40);
    let n = 2, candidate = s;
    while (used.has(candidate)) candidate = `${s.slice(0, 37).replace(/-+$/, '')}-${n++}`;
    used.add(candidate);
    out.set(v.id, candidate);
  }
  return out;
}
