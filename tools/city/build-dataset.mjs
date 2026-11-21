// Builds the city dataset from the OpenStreetMap downloads in data/raw/.
// Usage: node tools/city/build-dataset.mjs
// Writes data/city/venues.json, data/city/excluded.json and docs/leads/city-table.md.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { kindOf, normalizePhone, parseOpeningHours, siteKind } from './normalize.mjs';
import { assignSlugs } from './slug.mjs';
import { makeDistrictLocator, zipDistrict, DISTRICT_NAMES } from './district.mjs';
import { chainReason, normName } from './chains.mjs';
import { validateVenue } from '../venues/schema.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const osm = read('data/raw/osm-wien.json').elements;
const locate = makeDistrictLocator(read('data/raw/osm-districts.json').elements);
const siteChecks = existsSync('data/city/site-checks.json') ? read('data/city/site-checks.json') : {};

// Theme each kind starts with until the owner sends a photo of the sign.
export const KIND_THEME = {
  imbiss: { palette: 'red-yellow', lettering: 'block' },
  restaurant: { palette: 'cream-green', lettering: 'serif' },
  cafe: { palette: 'black-gold', lettering: 'serif' },
  friseur: { palette: 'black-white', lettering: 'narrow' },
  nails: { palette: 'white-black', lettering: 'serif' },
  kosmetik: { palette: 'white-black', lettering: 'serif' },
  handy: { palette: 'blue-white', lettering: 'narrow' },
  schneider: { palette: 'cream-green', lettering: 'serif' },
};

// ---- house addresses, in a grid for nearest-address lookups
const CELL = 500; // 1/500 degree ≈ 220 m north–south, 150 m east–west
const grid = new Map();
for (const a of read('data/raw/osm-addresses.json').elements) {
  const lat = a.lat ?? a.center?.lat, lon = a.lon ?? a.center?.lon;
  if (lat == null) continue;
  const key = `${Math.round(lat * CELL)}|${Math.round(lon * CELL)}`;
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push({ lat, lon, street: `${a.tags['addr:street']} ${a.tags['addr:housenumber']}`, zip: a.tags['addr:postcode'] || null });
}
const meters = (a, b, c, d) => {
  const dy = (a - c) * 111_320, dx = (b - d) * 111_320 * Math.cos((a * Math.PI) / 180);
  return Math.hypot(dx, dy);
};
function nearestAddress(lat, lon, max = 30) {
  let best = null, bestD = max;
  const y = Math.round(lat * CELL), x = Math.round(lon * CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const a of grid.get(`${y + i}|${x + j}`) || []) {
      const d = meters(lat, lon, a.lat, a.lon);
      if (d < bestD) { bestD = d; best = { ...a, distance: Math.round(d) }; }
    }
  }
  return best;
}

// ---- first pass: facts per element
const excluded = [];
const drop = (e, reason, extra = {}) => excluded.push({ osm: `${e.type}/${e.id}`, name: e.tags?.name || null, reason, ...extra });
const rows = [];
for (const e of osm) {
  const t = e.tags || {};
  const kind = kindOf(t);
  if (!kind) { drop(e, 'kind not served'); continue; }
  const name = (t.name || '').trim();
  if (!name) { drop(e, 'no name'); continue; }
  if (t.disused || t['disused:shop'] || t['disused:amenity'] || /^(yes|closed)$/.test(t.abandoned || '')) { drop(e, 'closed'); continue; }
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const district = locate(lon, lat) ?? zipDistrict(t['addr:postcode']);
  if (!district) { drop(e, 'outside the districts'); continue; }

  let street = null, zip = null, addressApprox = false, addressDistance = null;
  if (t['addr:street'] && t['addr:housenumber']) street = `${t['addr:street']} ${t['addr:housenumber']}`;
  zip = zipDistrict(t['addr:postcode']) ? t['addr:postcode'] : null;
  if (!street) {
    const near = nearestAddress(lat, lon);
    if (near) { street = near.street; addressApprox = true; addressDistance = near.distance; zip = zip || (zipDistrict(near.zip) ? near.zip : null); }
    else if (t['addr:street']) { street = t['addr:street']; addressApprox = true; }
  }
  zip = zip || `1${String(district).padStart(2, '0')}0`;

  const websiteRaw = t.website || t['contact:website'] || t.url || null;
  const socials = [t['contact:instagram'], t['contact:facebook'], t['contact:tiktok']].filter(Boolean);
  rows.push({
    id: `${e.type}/${e.id}`, tags: t, kind, name, lat, lon, district, street, zip, addressApprox, addressDistance,
    phone: normalizePhone(t.phone || t['contact:phone'] || t['contact:mobile']),
    hoursRaw: t.opening_hours || null, hours: parseOpeningHours(t.opening_hours),
    website: websiteRaw, site: siteKind(websiteRaw), socials,
    checkDate: t.check_date || t['check_date:opening_hours'] || null,
  });
}

// ---- chains
const districtsByName = new Map();
for (const r of rows) {
  const n = normName(r.name);
  if (!districtsByName.has(n)) districtsByName.set(n, new Set());
  districtsByName.get(n).add(r.district);
}
const repeats = new Map([...districtsByName].map(([n, s]) => [n, s.size]));
const kept = [];
for (const r of rows) {
  const why = chainReason(r.tags, repeats);
  if (why) excluded.push({ osm: r.id, name: r.name, reason: 'chain', detail: why, district: r.district, kind: r.kind });
  else kept.push(r);
}

// ---- duplicates: same name and kind within 60 m; keep the element with more tags
const richness = (r) => Object.keys(r.tags).length;
kept.sort((a, b) => richness(b) - richness(a));
const unique = [];
const seen = new Map();
for (const r of kept) {
  const key = normName(r.name) + '|' + r.kind;
  const twins = seen.get(key) || [];
  const twin = twins.find((o) => meters(o.lat, o.lon, r.lat, r.lon) < 60);
  if (twin) { excluded.push({ osm: r.id, name: r.name, reason: 'duplicate', of: twin.id }); continue; }
  twins.push(r); seen.set(key, twins); unique.push(r);
}

// ---- venues we already have facts files for
const existing = existsSync('venues') ? readdirSync('venues').filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => read(`venues/${f}`)) : [];
const existingSlugs = new Set(existing.map((v) => v.slug));
const claimed = new Set(); // each facts file matches one element at most
for (const r of unique) {
  const n = normName(r.name);
  const words = new Set(n.split(' ').filter((w) => w.length >= 4));
  const match = existing.find((v) => {
    if (v.address?.zip !== r.zip || claimed.has(v.slug)) return false;
    const m = normName(v.name);
    if (m === n || m.includes(n) || n.includes(m)) return true;
    const sameStreet = normName(v.address?.street) === normName(r.street);
    return sameStreet && m.split(' ').some((w) => words.has(w));
  });
  if (match) { r.existing = match.slug; claimed.add(match.slug); }
}

// ---- slugs (venues with a facts file keep theirs)
const slugs = assignSlugs(unique.filter((r) => !r.existing), existingSlugs);
for (const r of unique) r.slug = r.existing || slugs.get(r.id);
if (new Set(unique.map((r) => r.slug)).size !== unique.length) throw new Error('two venues got the same slug');

// ---- records
const venues = unique.map((r) => {
  const check = r.website ? siteChecks[r.website] : null;
  const uncertain = [];
  if (r.addressApprox) uncertain.push('address');
  const v = {
    slug: r.slug, status: 'hidden', kind: r.kind, name: r.name,
    area: DISTRICT_NAMES[r.district],
    address: { street: r.street, zip: r.zip, city: 'Wien' },
    ...(r.phone && { phone: r.phone }),
    ...(r.hours && { hours: r.hours }),
    theme: KIND_THEME[r.kind],
    source: 'osm',
    ...(uncertain.length && { uncertain }),
    internal: {
      osm: r.id, district: r.district, lat: r.lat, lon: r.lon,
      ...(r.existing && { existingFactsFile: true }),
      ...(r.addressApprox && { addressApprox: true, addressDistance: r.addressDistance }),
      ...(r.hoursRaw && { hoursRaw: r.hoursRaw }),
      ...(r.website && { website: r.website, site: r.site }),
      ...(check && { siteCheck: check }),
      ...(r.socials.length && { socials: r.socials }),
      ...(r.tags.cuisine && { cuisine: r.tags.cuisine }),
      ...(r.checkDate && { checkDate: r.checkDate }),
    },
  };
  // An address taken from the nearest house counts when that house is at most 15 m away;
  // it stays marked uncertain so the owner confirms it.
  v.ready = !!(r.street && /\d/.test(r.street) && (!r.addressApprox || (r.addressDistance != null && r.addressDistance <= 15)));
  const problems = r.street ? validateVenue({ ...v, ready: undefined }, v.slug) : ['no street'];
  if (problems.length) { v.ready = false; v.internal.problems = problems; }
  return v;
}).sort((a, b) => a.internal.district - b.internal.district || a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug));

mkdirSync('data/city', { recursive: true });
writeFileSync('data/city/venues.json', JSON.stringify(venues, null, 1));
writeFileSync('data/city/excluded.json', JSON.stringify(excluded, null, 1));

// ---- district × kind table
const KINDS = ['friseur', 'imbiss', 'restaurant', 'cafe', 'nails', 'kosmetik', 'handy', 'schneider'];
const KIND_RU = { friseur: 'Парикм.', imbiss: 'Кебаб/закус.', restaurant: 'Рестор.', cafe: 'Кафе', nails: 'Маникюр', kosmetik: 'Космет.', handy: 'Телеф.', schneider: 'Портные' };
const ownSite = (v) => v.internal.site === 'own';
const siteWorks = (v) => ownSite(v) && v.internal.siteCheck?.ok;
const noSite = (v) => !ownSite(v) || (v.internal.siteCheck && !v.internal.siteCheck.ok);
const cnt = (list, f) => list.filter(f).length;
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const checked = venues.some((v) => v.internal.siteCheck);

let md = `# Вена: точки по районам и нишам\n\nИсточник: OpenStreetMap, выгрузка ${new Date().toISOString().slice(0, 10)}. Сети, дубликаты и закрытые убраны.\n` +
  `Пересчитать: \`node tools/city/build-dataset.mjs\`.\n\n`;
md += `**Всего точек:** ${venues.length} · с точным адресом: ${cnt(venues, (v) => v.ready)} · с телефоном: ${cnt(venues, (v) => v.phone)} · с часами: ${cnt(venues, (v) => v.hours)} · ` +
  `свой сайт указан: ${cnt(venues, ownSite)}${checked ? ` (открывается: ${cnt(venues, siteWorks)})` : ''} · **без своего сайта: ${cnt(venues, noSite)}**\n\n`;
md += `Исключено: сети ${cnt(excluded, (x) => x.reason === 'chain')}, дубликаты ${cnt(excluded, (x) => x.reason === 'duplicate')}, без названия ${cnt(excluded, (x) => x.reason === 'no name')}, закрытые ${cnt(excluded, (x) => x.reason === 'closed')}, другой вид ${cnt(excluded, (x) => x.reason === 'kind not served')}.\n\n`;

md += `## Сколько точек (в скобках — без своего сайта)\n\n| Район | ${KINDS.map((k) => KIND_RU[k]).join(' | ')} | Всего |\n|---|${KINDS.map(() => '---:').join('|')}|---:|\n`;
for (let d = 1; d <= 23; d++) {
  const inD = venues.filter((v) => v.internal.district === d);
  md += `| ${d}. ${DISTRICT_NAMES[d]} | ${KINDS.map((k) => { const l = inD.filter((v) => v.kind === k); return l.length ? `${l.length} (${cnt(l, noSite)})` : '—'; }).join(' | ')} | **${inD.length}** (${cnt(inD, noSite)}) |\n`;
}
md += `| **Вена** | ${KINDS.map((k) => { const l = venues.filter((v) => v.kind === k); return `**${l.length}** (${cnt(l, noSite)})`; }).join(' | ')} | **${venues.length}** (${cnt(venues, noSite)}) |\n\n`;

md += `## Насколько полные данные, по нишам\n\n| Ниша | Точек | Точный адрес | Телефон | Часы | Свой сайт${checked ? ' | Сайт открывается' : ''} | Instagram/Facebook |\n|---|---:|---:|---:|---:|---:|${checked ? '---:|' : ''}---:|\n`;
for (const k of KINDS) {
  const l = venues.filter((v) => v.kind === k);
  md += `| ${KIND_RU[k]} | ${l.length} | ${pct(cnt(l, (v) => v.ready), l.length)} | ${pct(cnt(l, (v) => v.phone), l.length)} | ${pct(cnt(l, (v) => v.hours), l.length)} | ${pct(cnt(l, ownSite), l.length)}${checked ? ` | ${pct(cnt(l, siteWorks), cnt(l, ownSite))}` : ''} | ${pct(cnt(l, (v) => v.internal.socials || v.internal.site === 'social'), l.length)} |\n`;
}

const chainNames = new Map();
for (const x of excluded.filter((x) => x.reason === 'chain')) chainNames.set(x.name, (chainNames.get(x.name) || 0) + 1);
md += `\n## Убраны как сети (проверить список)\n\n` + [...chainNames].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(' · ') + '\n';
writeFileSync('docs/leads/city-table.md', md);

console.log(`venues ${venues.length}, ready ${cnt(venues, (v) => v.ready)}, excluded ${excluded.length}, existing matched ${cnt(unique, (r) => r.existing)}`);
