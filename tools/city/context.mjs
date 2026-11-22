// What is around a venue, from our own downloads only: other kinds of venues nearby, the nearest stop,
// a few OSM facts (terrace, wheelchair, vegan …) and the lines of a small street map drawn by the page itself.
// Usage: node tools/city/context.mjs <city> [--public <rows.json>] [slug ...]   → writes <dataset dir>/context.json  { slug: context }
// --public: the published venues read from the database (slug, kind, name, palette, city, lat, lon, cuisine, osm);
// then pages and neighbours come only from that list, so no neighbour link leads to a page that does not exist.
import { readFileSync, writeFileSync } from 'node:fs';
import { cityPaths } from './paths.mjs';
import { medalIcon } from '../../api/_lib/venues/around.mjs';

export const NEAR_RADIUS = 300;   // metres: neighbours we name
export const NEAR_MAX = 6;
/** Trades that compete for the same visit: food, beauty, repairs. */
export const GROUP = { imbiss: 'food', restaurant: 'food', cafe: 'food', friseur: 'beauty', nails: 'beauty', kosmetik: 'beauty', handy: 'repair', schneider: 'repair' };
export const STOP_RADIUS = 700;   // metres: nearest stop worth naming
export const MAP_W = 600, MAP_H = 340, MAP_HALF_W = 160; // the map shows ~320 m across

const M_PER_DEG_LAT = 111_320;
/** Metres east/north of an origin, flat-earth (fine for a few hundred metres). */
export function project(lat, lon, lat0, lon0) {
  return [(lon - lon0) * M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * M_PER_DEG_LAT];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** OSM tags we can say plainly; only "yes"-type values, never a guess from a missing tag. */
export function osmFacts(tags = {}) {
  const f = [];
  if (tags.outdoor_seating === 'yes') f.push('terrace');
  if (tags.wheelchair === 'yes') f.push('wheelchair');
  else if (tags.wheelchair === 'limited') f.push('wheelchairLimited');
  if (tags.takeaway === 'yes' || tags.takeaway === 'only') f.push('takeaway');
  if (tags.delivery === 'yes') f.push('delivery');
  if (tags['diet:vegan'] === 'yes' || tags['diet:vegan'] === 'only') f.push('vegan');
  else if (tags['diet:vegetarian'] === 'yes' || tags['diet:vegetarian'] === 'only') f.push('vegetarian');
  if (['payment:cards', 'payment:debit_cards', 'payment:credit_cards'].some((k) => tags[k] === 'yes')) f.push('cards');
  if (tags.internet_access === 'wlan' || tags.internet_access === 'yes') f.push('wifi');
  if (tags.dog === 'yes' || tags.dog === 'leashed') f.push('dog');
  if (tags.air_conditioning === 'yes') f.push('aircon');
  if (tags.highchair === 'yes') f.push('highchair');
  if (['yes', 'recommended', 'only', 'required'].includes(tags.reservation)) f.push('reservation');
  return f;
}

function stopType(t) {
  if (t.station === 'subway' || t.subway === 'yes') return 'u';
  if (t.railway === 'tram_stop' || t.tram === 'yes') return 'tram';
  if (t.railway === 'station' || t.railway === 'halt' || t.train === 'yes') return 's';
  return 'bus';
}

/** Streets as SVG path data in a MAP_W×MAP_H box centred on the venue (north up), clipped by the box. */
function mapLines(ways, lat0, lon0) {
  const scale = MAP_W / 2 / MAP_HALF_W;
  const halfH = MAP_H / 2 / scale;
  const pad = 40;
  const toXY = ([x, y]) => [Math.round(MAP_W / 2 + x * scale), Math.round(MAP_H / 2 - y * scale)];
  const RX = MAP_HALF_W + pad, RY = halfH + pad;
  // a segment touches the box when its bounding box overlaps it (enough at this scale; the SVG clips the rest)
  const segIn = (a, b) => !(Math.max(a[0], b[0]) < -RX || Math.min(a[0], b[0]) > RX || Math.max(a[1], b[1]) < -RY || Math.min(a[1], b[1]) > RY);
  const out = [];
  for (const w of ways) {
    const pts = w.geometry.map((g) => project(g.lat, g.lon, lat0, lon0));
    // keep runs of points that touch the box (plus one point either side so lines leave the frame)
    let run = [];
    const flush = () => { if (run.length > 1) out.push({ name: w.tags.name, big: /^(primary|secondary|trunk|tertiary)$/.test(w.tags.highway), pts: run.map(toXY) }); run = []; };
    for (let i = 0; i < pts.length; i++) {
      const near = (i > 0 && segIn(pts[i - 1], pts[i])) || (i < pts.length - 1 && segIn(pts[i], pts[i + 1]));
      if (near) run.push(pts[i]); else flush();
    }
    flush();
  }
  // merge into one path per street name (smaller page), keep the longest piece for the label
  const byName = new Map();
  for (const l of out) {
    const s = byName.get(l.name) || { name: l.name, big: false, d: [], label: null, len: 0 };
    s.big = s.big || l.big;
    s.d.push('M' + l.pts.map((p) => p.join(' ')).join('L'));
    let len = 0; for (let i = 1; i < l.pts.length; i++) len += dist(l.pts[i], l.pts[i - 1]);
    if (len > s.len) { s.len = len; s.label = l.pts; }
    byName.set(l.name, s);
  }
  return [...byName.values()].map((s) => {
    let lp = s.label;
    if (lp[0][0] > lp[lp.length - 1][0]) lp = [...lp].reverse(); // text reads left to right
    const closed = dist(lp[0], lp[lp.length - 1]) < s.len / 4; // a loop or a square: its name would print upside down
    return { name: s.name, big: s.big, d: s.d.join(''), label: s.len > 90 && !closed ? 'M' + lp.map((p) => p.join(' ')).join('L') : null };
  });
}

export function buildContext(v, { venues, streets, stops, osmById }) {
  const lat0 = v.internal.lat, lon0 = v.internal.lon;
  const here = [0, 0];
  const others = venues.filter((o) => o.slug !== v.slug && o.internal && o.internal.lat)
    .map((o) => ({ o, p: project(o.internal.lat, o.internal.lon, lat0, lon0) }))
    .map((x) => ({ ...x, m: dist(here, x.p) }))
    .filter((x) => x.m <= 600);
  // never the same kind: a kebab page does not send its guests to the next kebab
  const food = (o) => String((o.internal && o.internal.cuisine) || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const mine = new Set(food(v));
  // nor a place that serves what this one serves (a Turkish restaurant next to a kebab stand)
  const rival = (o) => o.kind === v.kind || food(o).some((c) => mine.has(c)) || (mine.has('kebab') && food(o).some((c) => ['turkish', 'pide', 'oriental'].includes(c)));
  // other trades first (a kebab stand shows the hairdresser and the tailor before another restaurant), nearest first within each
  const mineG = GROUP[v.kind];
  const nearX = others.filter((x) => !rival(x.o) && x.m <= NEAR_RADIUS)
    .sort((a, b) => (GROUP[a.o.kind] === mineG) - (GROUP[b.o.kind] === mineG) || a.m - b.m).slice(0, NEAR_MAX);
  const scale = MAP_W / 2 / MAP_HALF_W;
  const toXY = ([x, y]) => [Math.round(MAP_W / 2 + x * scale), Math.round(MAP_H / 2 - y * scale)];
  const onMap = ([x, y]) => Math.abs(x) < MAP_HALF_W - 6 && Math.abs(y) < MAP_H / 2 / scale - 6;
  // a neighbour next door is pushed out a little so the venue's own dot stays visible
  const clear = ([x, y]) => {
    const dx = x - MAP_W / 2, dy = y - MAP_H / 2, r = Math.hypot(dx, dy), min = 34;
    if (r >= min) return [x, y];
    const a = r ? Math.atan2(dy, dx) : -Math.PI / 4;
    return [Math.round(MAP_W / 2 + Math.cos(a) * min), Math.round(MAP_H / 2 + Math.sin(a) * min)];
  };
  // each named neighbour carries its own pictogram and sign colours, and its spot on the map when it is on it
  const near = nearX.map((x) => ({ slug: x.o.slug, name: x.o.name, kind: x.o.kind, m: Math.max(10, Math.round(x.m / 10) * 10),
    icon: medalIcon({ kind: x.o.kind, name: x.o.name, context: { cuisine: food(x.o) } }) || undefined,
    palette: (x.o.theme && x.o.theme.palette) || undefined, xy: onMap(x.p) ? clear(toXY(x.p)) : undefined }));
  const named = new Set(nearX.map((x) => x.o.slug));
  const dots = others.filter((x) => onMap(x.p) && !named.has(x.o.slug)).map((x) => toXY(x.p));
  let stop = null;
  for (const s of stops) {
    const p = project(s.lat, s.lon, lat0, lon0);
    const m = dist(here, p);
    if (m > STOP_RADIUS) continue;
    const type = stopType(s.tags);
    const rank = { u: 0, s: 1, tram: 2, bus: 3 }[type];
    // a U-Bahn a little further beats a bus stop at the door
    const score = m + rank * 120;
    if (!stop || score < stop.score) stop = { name: s.tags.name, type, m: Math.round(m / 10) * 10, min: Math.max(1, Math.ceil((m * 1.3) / 80)), score, xy: onMap(p) ? toXY(p) : null };
  }
  if (stop) delete stop.score;
  const osm = osmById.get(v.internal.osm);
  const cuisine = String(v.internal.cuisine || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { near, stop, cuisine, facts: osmFacts(osm && osm.tags), map: { w: MAP_W, h: MAP_H, streets: mapLines(streets, lat0, lon0), dots } };
}

/** Database rows → the shape buildContext reads. */
export function fromRows(rows) {
  return rows.map((r) => ({ slug: r.slug, kind: r.kind, name: r.name, theme: r.palette ? { palette: r.palette } : undefined,
    internal: { lat: r.lat, lon: r.lon, cuisine: r.cuisine || undefined, osm: r.osm || undefined } }));
}

function loadIndex(city) {
  const p = cityPaths(city);
  const venues = JSON.parse(readFileSync(p.venues, 'utf8'));
  const ways = JSON.parse(readFileSync(p.streets, 'utf8')).elements.filter((e) => e.type === 'way' && e.geometry);
  const stops = JSON.parse(readFileSync(p.stops, 'utf8')).elements.filter((e) => e.type === 'node');
  const osmById = new Map(JSON.parse(readFileSync(p.osm, 'utf8')).elements.map((e) => [`${e.type}/${e.id}`, e]));
  return { p, venues, ways, stops, osmById };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('context.mjs')) {
  const args = process.argv.slice(2);
  const city = args.shift() || 'wien';
  let pub = null;
  const at = args.indexOf('--public');
  if (at >= 0) { pub = JSON.parse(readFileSync(args[at + 1], 'utf8')); args.splice(at, 2); }
  const only = new Set(args);
  const idx = loadIndex(city);
  const { p, ways, stops, osmById } = idx;
  const venues = pub ? fromRows(pub.filter((r) => (r.city || 'wien') === city && r.lat)) : idx.venues;
  const out = {};
  for (const v of venues) {
    if (only.size && !only.has(v.slug)) continue;
    // only ways near this venue: cheap pre-filter by a ~0.01° box
    const near = ways.filter((w) => w.bounds ? !(w.bounds.maxlat < v.internal.lat - 0.004 || w.bounds.minlat > v.internal.lat + 0.004 || w.bounds.maxlon < v.internal.lon - 0.006 || w.bounds.minlon > v.internal.lon + 0.006) : true);
    out[v.slug] = buildContext(v, { venues, streets: near, stops, osmById });
  }
  const file = `${p.dir}/context.json`;
  writeFileSync(file, JSON.stringify(out));
  console.log(file, Object.keys(out).length, 'venues');
}
