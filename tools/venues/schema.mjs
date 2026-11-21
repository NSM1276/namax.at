// Shape and rules of a venue facts file (venues/<slug>.json).
import { PALETTES, LETTERINGS } from './themes.mjs';
export const KINDS = ['imbiss', 'restaurant', 'cafe', 'friseur', 'nails', 'kosmetik', 'handy', 'schneider', 'other'];
export const STATUSES = ['hidden', 'public', 'removed'];
export const RESERVED_SLUGS = ['www', 'mail', 'mail-in', 'test', 'api', 'admin', 'finden', 'v', 'cloudpit'];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isText = (x) => typeof x === 'string' && x.trim().length > 0;
const isLabel = (x) => isText(x) || (isObj(x) && isText(x.de) && isText(x.en));
const isMonth = (x) => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const isMinute = (x) => Number.isInteger(x) && x >= 0 && x <= 1440;

/** Returns a list of human-readable problems; an empty list means the venue is valid. */
export function validateVenue(venue, fileSlug) {
  const e = [];
  if (!isObj(venue)) return ['venue must be an object'];

  const { slug } = venue;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) {
    e.push(`slug "${slug}" must be 3–40 chars of a–z, 0–9 and single hyphens`);
  } else if (RESERVED_SLUGS.includes(slug)) {
    e.push(`slug "${slug}" is reserved`);
  }
  if (slug !== fileSlug) e.push(`slug "${slug}" must equal the file name "${fileSlug}"`);

  if (!STATUSES.includes(venue.status)) e.push(`status must be one of ${STATUSES.join(', ')}`);
  if (!KINDS.includes(venue.kind)) e.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!isText(venue.name)) e.push('name is required');
  if (!isObj(venue.address) || !isText(venue.address.street) || !isText(venue.address.zip) || !isText(venue.address.city)) {
    e.push('address needs street, zip and city');
  }

  if (venue.area != null && !isText(venue.area)) e.push('area must be text');
  if (venue.phone != null && !/^\+[1-9]\d{6,14}$/.test(venue.phone)) e.push('phone must look like +436601234567');

  if (venue.hours != null) {
    const ok = Array.isArray(venue.hours) && venue.hours.length === 7 && venue.hours.every((d) =>
      d === null || (Array.isArray(d) && d.length === 2 && isMinute(d[0]) && d[0] < 1440 && isMinute(d[1]) && d[0] !== d[1]));
    if (!ok) e.push('hours must be 7 entries (Sunday first) of null or [open, close] in minutes 0..1440');
  }

  if (venue.rating != null) {
    const r = venue.rating;
    if (!isObj(r) || typeof r.value !== 'number' || r.value < 1 || r.value > 5 ||
        !Number.isInteger(r.count) || r.count < 1 || !isText(r.source) || !isMonth(r.date)) {
      e.push('rating needs value 1..5, count ≥ 1, source and date YYYY-MM');
    }
  }

  if (venue.list != null) {
    const l = venue.list;
    if (!isObj(l) || !isMonth(l.asOf) || !Array.isArray(l.groups) || l.groups.length === 0) {
      e.push('list needs asOf YYYY-MM and at least one group');
    } else {
      l.groups.forEach((g, gi) => {
        if (!isObj(g) || (g.title != null && !isLabel(g.title)) || !Array.isArray(g.items) || g.items.length === 0) {
          e.push(`list group ${gi + 1} needs items (and a text title if it has one)`);
          return;
        }
        g.items.forEach((it, ii) => {
          const where = `list group ${gi + 1} item ${ii + 1}`;
          if (!isObj(it) || !isLabel(it.name)) { e.push(`${where}: name is required`); return; }
          if (it.price != null && (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0 || it.price > 100000)) e.push(`${where}: price must be a number from 0 to 100000, or null`);
          if (it.note != null && !isLabel(it.note)) e.push(`${where}: note must be text`);
        });
      });
    }
  }

  if (venue.facts != null) {
    const f = venue.facts;
    if (!isObj(f)) e.push('facts must be an object');
    else {
      if (f.walkIn != null && typeof f.walkIn !== 'boolean') e.push('facts.walkIn must be true or false');
      if (f.payment != null && !(Array.isArray(f.payment) && f.payment.every((p) => ['cash', 'card'].includes(p)))) e.push('facts.payment may contain cash, card');
      if (f.transit != null && !isText(f.transit)) e.push('facts.transit must be text');
      if (f.languages != null && !(Array.isArray(f.languages) && f.languages.every((c) => /^[a-z]{2}$/.test(c)))) e.push('facts.languages must be two-letter codes');
    }
  }

  if (venue.photos != null) {
    const isPhoto = (p) => typeof p === 'string' && /^[a-z0-9-]+.(jpe?g|webp|png)$/.test(p);
    if (!Array.isArray(venue.photos) || venue.photos.length > 4 || !venue.photos.every(isPhoto)) e.push('photos: at most 4 plain file names such as foto-1.jpg (the files live in v/<slug>/)');
  }
  if (venue.theme != null) {
    const t = venue.theme;
    if (!isObj(t)) e.push('theme must be an object');
    else {
      if (t.palette != null && !Object.hasOwn(PALETTES, t.palette)) e.push(`theme.palette must be one of ${Object.keys(PALETTES).join(', ')}`);
      if (t.lettering != null && !Object.hasOwn(LETTERINGS, t.lettering)) e.push(`theme.lettering must be one of ${Object.keys(LETTERINGS).join(', ')}`);
    }
  }

  return e;
}
