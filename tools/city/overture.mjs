// Second opinion on an OpenStreetMap venue from Overture Maps places (data/places/overture-<area>.json).
//
// Verdicts:
//   both    — Overture has the same place (≤ 80 m, same name or same phone) and does not call it closed
//   closed  — Overture has the same place and marks it permanently or temporarily closed
//   other   — no such place, but another open business of the same kind sits at the same address (new owner?)
//   osm     — Overture knows nothing that confirms or contradicts the venue
import { normName } from './chains.mjs';
import { normalizePhone, siteKind } from './normalize.mjs';

export const MATCH_METERS = 80;
const ADDRESS_METERS = 300;
const OTHER_METERS = 40;
const CELL = 1000; // 1/1000 degree ≈ 111 m north–south

// Words too common in venue names to tie two places together on their own.
const STOP = new Set(['friseur', 'frisor', 'friseursalon', 'salon', 'hair', 'hairstyle', 'style', 'styling', 'barber', 'barbershop',
  'beauty', 'nails', 'nail', 'studio', 'kosmetik', 'cafe', 'caffe', 'coffee', 'kaffee', 'restaurant', 'ristorante', 'pizzeria',
  'pizza', 'gasthaus', 'imbiss', 'kebab', 'kebap', 'doner', 'grill', 'bistro', 'sushi', 'asia', 'china', 'thai', 'handy', 'handyshop',
  'mobile', 'phone', 'shop', 'store', 'service', 'center', 'wien', 'vienna', 'gmbh', 'schneiderei', 'anderungsschneiderei', 'and', 'the',
  'haus', 'stub', 'stube', 'bar', 'lounge', 'house', 'king', 'point', 'express', 'internet',
  // generic food, origin and shop words: "Mangal Kitchen" is not "Yummy Kitchen"
  'kitchen', 'kuche', 'food', 'foods', 'cuisine', 'royal', 'african', 'afrika', 'india', 'indian', 'turkish', 'persian', 'persisches',
  'burger', 'chicken', 'team', 'paradise', 'more', 'star', 'damen', 'herren', 'und', 'mit', 'fur', 'snack', 'corner', 'world', 'city']);

const KIND_CATEGORY = {
  friseur: /hair|barber/,
  nails: /nail|beauty_salon/,
  kosmetik: /beauty|cosmet|spa|skin|wax|tanning|massage|lash|brow/,
  imbiss: /fast_food|kebab|doner|snack|pizza|burger|hot_dog|food_stand|sandwich|chicken|restaurant/,
  restaurant: /restaurant|bistro|eatery|food/,
  cafe: /cafe|coffee|bakery|tea|dessert|ice_cream|patisserie|pastry/,
  handy: /mobile_phone|phone|electronics|computer_repair|it_service/,
  schneider: /tailor|sewing|alteration/,
};

const meters = (a, b, c, d) => Math.hypot((a - c) * 111_320, (b - d) * 111_320 * Math.cos((a * Math.PI) / 180));
const compact = (s) => normName(s).replace(/ /g, '');
const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
function dice(a, b) {
  const x = bigrams(a), y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const pool = [...y];
  let hit = 0;
  for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (x.length + y.length);
}

/** True when two venue names plausibly name the same business. */
export function sameName(a, b) {
  const ca = compact(a), cb = compact(b);
  // a short name standing whole inside the other: "5er" in "Cafe 5er", "B&T" in "B&T Friseur"
  const tokens = (s) => normName(s).split(' ').filter((w) => w && !STOP.has(w));
  const [ta, tb] = [tokens(a), tokens(b)].sort((x, y) => x.length - y.length);
  if (ta.length && ta.join('').length >= 2 && ta.length <= 2 && ta.every((w) => tb.includes(w))) return true;
  if (ca.length < 3 || cb.length < 3) return false;
  if (ca === cb) return true;
  if (Math.min(ca.length, cb.length) >= 4 && (ca.includes(cb) || cb.includes(ca))) return true;
  const words = (s) => normName(s).split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
  const wa = words(a), wb = words(b);
  // the same distinctive word, allowing a letter or two of spelling (Aladin / Aladdin)
  if (wa.some((x) => wb.some((y) => x === y || (x.length >= 5 && y.length >= 5 && dice(x, y) >= 0.8)))) return true;
  return dice(ca, cb) >= 0.75;
}

const streetKey = (s) => {
  const n = normName(s).replace(/\bstr\b/g, 'strasse').replace(/\bpl\b/g, 'platz').replace(/\bg\b/g, 'gasse');
  const m = /^(.*?)\s*(\d+)/.exec(n);
  return m ? `${m[1].replace(/ /g, '')}|${m[2]}` : null;
};

/** places: the "places" array of an overture-<area>.json file. */
export function overtureIndex(places) {
  const grid = new Map();
  for (const p of places) {
    const k = `${Math.round(p.lat * CELL)}|${Math.round(p.lon * CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return {
    near(lat, lon, max) {
      const out = [];
      const y = Math.round(lat * CELL), x = Math.round(lon * CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const p of grid.get(`${y + i}|${x + j}`) || []) {
          const d = meters(lat, lon, p.lat, p.lon);
          if (d <= max) out.push({ p, d });
        }
      }
      return out.sort((a, b) => a.d - b.d);
    },
  };
}

const summary = ({ p, d }) => ({
  id: p.id, name: p.n, status: p.s || null, distance: Math.round(d),
  ...(p.ph && normalizePhone(p.ph) && { phone: normalizePhone(p.ph) }),
  ...(p.w && { website: p.w }),
  ...(p.cat && { category: p.cat }),
});

/**
 * venue: { kind, name, phone?, street?, lat, lon } → { verdict, match?, other? }
 * match is the Overture place taken as the same business; other is the business found at its address instead.
 */
export function overtureVerdict(venue, index) {
  if (venue.lat == null || venue.lon == null) return { verdict: 'osm' };
  const phone = normalizePhone(venue.phone);
  const key = streetKey(venue.street);
  const near = index.near(venue.lat, venue.lon, ADDRESS_METERS);
  // Overture sometimes puts a point a block away from its own address; a same-name place at the same address still counts.
  const same = near.filter(({ p, d }) => (sameName(venue.name, p.n) && (d <= MATCH_METERS || (key && streetKey(p.st) === key)))
    || (d <= MATCH_METERS && phone && normalizePhone(p.ph) === phone));
  const alive = same.find(({ p }) => p.s !== 'permanently_closed' && p.s !== 'temporarily_closed');
  if (alive) return { verdict: 'both', match: summary(alive) };
  if (same.length) return { verdict: 'closed', match: summary(same[0]) };
  const kindRe = KIND_CATEGORY[venue.kind];
  const other = key && kindRe && near.find(({ p, d }) => d <= OTHER_METERS && p.s !== 'permanently_closed'
    && kindRe.test(p.cat || '') && streetKey(p.st) === key);
  if (other) return { verdict: 'other', other: summary(other) };
  return { verdict: 'osm' };
}

/** overtureVerdict plus the release it came from and, when Overture lists the venue's own website, that site's check. */
export function secondOpinion(venue, index, release, siteChecks = {}) {
  const r = overtureVerdict(venue, index);
  const site = r.match?.website;
  const check = site && siteKind(site) === 'own' ? siteChecks[site] : null;
  return { ...r, release, ...(check && { siteCheck: { state: check.state } }) };
}

/**
 * facts with internal.overture set to the opinion. Opening hours are marked uncertain (kept off the page until the
 * owner confirms them) unless both sources agree; a mark this function set earlier is lifted when they agree again.
 */
export function withOverture(facts, opinion) {
  const f = structuredClone(facts);
  const before = f.internal?.overture || {};
  const uncertain = new Set(f.uncertain || []);
  if (before.hidHours) uncertain.delete('hours');
  const hideHours = opinion.verdict !== 'both' && Boolean(f.hours) && !uncertain.has('hours');
  if (hideHours) uncertain.add('hours');
  if (uncertain.size) f.uncertain = [...uncertain]; else delete f.uncertain;
  f.internal = { ...(f.internal || {}), overture: { ...opinion, ...(hideHours && { hidHours: true }), ...(before.hidPage && { hidPage: true }) } };
  return f;
}

/**
 * What a public page's status should become: a venue Overture calls closed is hidden (noindex, out of the sitemap),
 * once; if Nasim shows it again it stays shown. A page hidden this way is shown again when Overture stops calling it closed.
 * → { status, hidPage }
 */
export function statusAfter({ status, confirmed, verdict, hidPage }) {
  if (verdict === 'closed' && status === 'public' && !confirmed && !hidPage) return { status: 'hidden', hidPage: true };
  if (verdict !== 'closed' && status === 'hidden' && hidPage) return { status: 'public', hidPage: false };
  return { status, hidPage: Boolean(hidPage) };
}
