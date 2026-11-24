import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, osmFacts } from './context.mjs';
import { aroundSections } from '../../api/_lib/venues/around.mjs';
import { renderVenue } from '../../api/_lib/venues/template.mjs';

const at = (slug, kind, dLat, dLon = 0) => ({ slug, kind, name: slug.toUpperCase(), internal: { lat: 48.18 + dLat, lon: 16.33 + dLon, osm: `node/${slug.length}` } });
const me = { ...at('doener', 'imbiss', 0), address: { street: 'Meidlinger Hauptstraße 67', zip: '1120', city: 'Wien' }, theme: {} };
const street = { type: 'way', tags: { name: 'Meidlinger Hauptstraße', highway: 'secondary' }, geometry: [{ lat: 48.178, lon: 16.33 }, { lat: 48.182, lon: 16.33 }] };

test('neighbours are never the same kind, nearest first, at most six, within 300 m', () => {
  const venues = [me, at('kebab-2', 'imbiss', 0.0002), ...Array.from({ length: 8 }, (_, i) => at(`cafe-${i}`, 'cafe', 0.0003 * (i + 1))), at('far', 'friseur', 0.01)];
  const c = buildContext(me, { venues, streets: [street], stops: [], osmById: new Map() });
  assert.equal(c.near.length, 6);
  assert.ok(c.near.every((x) => x.kind !== 'imbiss'), 'no other kebab on a kebab page');
  assert.deepEqual(c.near.map((x) => x.slug), ['cafe-0', 'cafe-1', 'cafe-2', 'cafe-3', 'cafe-4', 'cafe-5'], 'only cafés nearby: they fill the list');
  assert.ok(!c.near.some((x) => x.slug === 'far'));
  assert.ok(c.map.streets.length === 1 && c.map.streets[0].d.startsWith('M'));
});

test('nearest stop: a U-Bahn a little further beats a bus at the door; walking minutes', () => {
  const stops = [
    { type: 'node', lat: 48.1801, lon: 16.33, tags: { name: 'Bus Ecke', highway: 'bus_stop' } },
    { type: 'node', lat: 48.1815, lon: 16.33, tags: { name: 'Niederhofstraße', railway: 'station', station: 'subway' } },
  ];
  const c = buildContext(me, { venues: [me], streets: [], stops, osmById: new Map() });
  assert.equal(c.stop.name, 'Niederhofstraße');
  assert.equal(c.stop.type, 'u');
  assert.equal(c.stop.min, 3);
});

test('OSM facts only from a clear yes, never from a missing tag', () => {
  assert.deepEqual(osmFacts({ outdoor_seating: 'yes', wheelchair: 'no', takeaway: 'only', 'diet:vegan': 'no', 'diet:vegetarian': 'yes', 'payment:debit_cards': 'yes' }),
    ['terrace', 'takeaway', 'vegetarian', 'cards']);
  assert.deepEqual(osmFacts({}), []);
  assert.deepEqual(osmFacts(undefined), []);
});

test('page: map and nearby only with a context; a paying owner (near = []) gets the map without neighbours', () => {
  const base = { slug: 'doener', kind: 'imbiss', name: 'Döner', address: me.address, theme: { palette: 'black-gold', lettering: 'serif' } };
  const plain = renderVenue(base);
  assert.ok(!plain.includes('Rundherum') && !plain.includes('In der Nähe') && !plain.includes('class="medal"'));
  const ctx = buildContext(me, { venues: [me, at('cafe-0', 'cafe', 0.0005)], streets: [street], stops: [], osmById: new Map([['node/6', { tags: { outdoor_seating: 'yes' } }]]) });
  const page = renderVenue({ ...base, context: ctx });
  assert.ok(page.includes('Rundherum') && page.includes('https://cafe-0.namax.at/') && page.includes('class="medal"') && page.includes('Schanigarten'));
  const paid = aroundSections({ ...base, context: { ...ctx, near: [] } });
  assert.ok(paid.includes('<svg') && !paid.includes('In der Nähe'));
});

test('no neighbour that serves the same food, even when it is filed as another kind', () => {
  const kebab = { ...me, internal: { ...me.internal, cuisine: 'kebab' } };
  const turk = { ...at('konak', 'restaurant', 0.0002), internal: { ...at('konak', 'restaurant', 0.0002).internal, cuisine: 'turkish' } };
  const pizza = { ...at('pizzeria', 'restaurant', 0.0003), internal: { ...at('pizzeria', 'restaurant', 0.0003).internal, cuisine: 'pizza;kebab' } };
  const c = buildContext(kebab, { venues: [kebab, turk, pizza, at('salon', 'friseur', 0.0004)], streets: [], stops: [], osmById: new Map() });
  assert.deepEqual(c.near.map((x) => x.slug), ['salon']);
});

test('medallion: first known cuisine wins, else the kind; a kebab stand shows the döner spit', async () => {
  const { medalIcon } = await import('../../api/_lib/venues/around.mjs');
  assert.equal(medalIcon({ kind: 'imbiss', context: { cuisine: ['unknown', 'kebab', 'pizza'] } }), 'kebab');
  assert.equal(medalIcon({ kind: 'imbiss', context: { cuisine: [] } }), 'restaurant');
  assert.equal(medalIcon({ kind: 'friseur', context: {} }), 'scissors');
  assert.equal(medalIcon({ kind: 'other', context: {} }), '');
  assert.equal(medalIcon({ kind: 'restaurant', context: { cuisine: ['mexican'] } }), 'taco');
  assert.equal(medalIcon({ kind: 'restaurant', context: { cuisine: ['indian'] } }), 'curry');
  assert.equal(medalIcon({ kind: 'restaurant', context: { cuisine: ['steak_house'] } }), 'steak');
  assert.equal(medalIcon({ kind: 'imbiss', context: { cuisine: ['falafel'] } }), 'falafel');
  assert.equal(medalIcon({ kind: 'schneider', context: {} }), 'sewing-machine');
});

test('the name on the sign beats the OSM cuisine; the earliest dish word in the name wins', async () => {
  const { medalIcon } = await import('../../api/_lib/venues/around.mjs');
  assert.equal(medalIcon({ kind: 'imbiss', name: "Baki's Schnitzelparadies", context: { cuisine: ['chicken', 'fish'] } }), 'schnitzel');
  assert.equal(medalIcon({ kind: 'imbiss', name: 'Kebap Schnitzel Hot Dog Nudeln', context: { cuisine: ['hot_dog'] } }), 'kebab');
  assert.equal(medalIcon({ kind: 'imbiss', name: 'Burger & Schnitzel Haus', context: { cuisine: [] } }), 'burger');
  assert.equal(medalIcon({ kind: 'restaurant', name: 'Pizzeria Roma', context: { cuisine: ['italian'] } }), 'pizza');
  assert.equal(medalIcon({ kind: 'restaurant', name: 'Zum Goldenen Hirschen', context: { cuisine: ['escalope'] } }), 'schnitzel');
  assert.equal(medalIcon({ kind: 'friseur', name: 'Kebab Cuts', context: {} }), 'scissors');
});

test('neighbours get the same name-first icon', () => {
  const venues = [me, { ...at('schnitzel-x', 'restaurant', 0.0005), name: 'Schnitzel X' }];
  const c = buildContext(me, { venues, streets: [], stops: [], osmById: new Map() });
  assert.equal(c.near.find((x) => x.slug === 'schnitzel-x')?.icon, 'schnitzel');
});

test('every icon the pages can ask for exists in the pictogram set', async () => {
  const { iconNames } = await import('../../api/_lib/venues/around.mjs');
  const P = (await import('../../api/_lib/venues/pictograms.mjs')).default;
  assert.deepEqual(iconNames().filter((n) => !P[n]), []);
});

test('osmFacts: dogs, air conditioning, high chairs and reservations only on a clear yes', () => {
  assert.deepEqual(osmFacts({ dog: 'yes', air_conditioning: 'yes', highchair: 'yes', reservation: 'recommended' }), ['dog', 'aircon', 'highchair', 'reservation']);
  assert.deepEqual(osmFacts({ dog: 'leashed', air_conditioning: 'no', highchair: 'no', reservation: 'no' }), ['dog']);
  assert.deepEqual(osmFacts({ dog: 'no', reservation: 'only' }), ['reservation']);
});

test('other trades come first: a kebab stand shows hairdresser and tailor before a café; a phone shop shows food and beauty first', () => {
  const venues = [me, at('cafe-near', 'cafe', 0.0001), at('salon', 'friseur', 0.0015), at('tailor', 'schneider', 0.002), at('handy-2', 'handy', 0.0003)];
  const c = buildContext(me, { venues, streets: [], stops: [], osmById: new Map() });
  assert.deepEqual(c.near.map((x) => x.slug), ['handy-2', 'salon', 'tailor', 'cafe-near']);
  const shop = { ...at('handy', 'handy', 0), address: me.address };
  const d = buildContext(shop, { venues: [shop, ...venues.slice(1)], streets: [], stops: [], osmById: new Map() });
  assert.deepEqual(d.near.map((x) => x.slug), ['cafe-near', 'salon', 'tailor'], 'no other phone shop, the tailor (same trade group) last');
});

test('district illustration: Vienna by post code, other cities by name, nothing without a context or for an unknown area', async () => {
  const { districtArt } = await import('../../api/_lib/venues/around.mjs');
  assert.match(districtArt({ address: { zip: '1030', city: 'Wien' } }), /\/v\/_shared\/districts\/wien-03\.webp/);
  assert.match(districtArt({ address: { zip: '1030', city: 'Wien' } }), /aria-label="Belvedere"/);
  assert.match(districtArt({ address: { zip: '8010', city: 'Graz' } }), /districts\/graz\.webp/);
  assert.match(districtArt({ address: { zip: '1110', city: 'Wien' } }), /<figcaption>11\. Simmering · Gasometer<\/figcaption>/);
  assert.match(districtArt({ address: { zip: '8010', city: 'Graz' } }), /<figcaption>Graz · Uhrturm am Schlossberg<\/figcaption>/);
  assert.equal(districtArt({ address: { zip: '1300', city: 'Wien' } }), '');
  assert.equal(districtArt({ address: { zip: '2340', city: 'Mödling' } }), '');
  const page = renderVenue({ slug: 'x', kind: 'cafe', name: 'X', address: { street: 'A 1', zip: '1040', city: 'Wien' }, theme: {}, context: { near: [], facts: [], map: { w: 600, h: 340, streets: [], dots: [] } } });
  assert.ok(page.includes('districts/wien-04.webp'));
  assert.ok(!renderVenue({ slug: 'x', kind: 'cafe', name: 'X', address: { street: 'A 1', zip: '1040', city: 'Wien' }, theme: {} }).includes('districts/'));
});

test('niche banner: a "Symbolbild" of the trade where the facade would be, until there are real photos; its button opens the owner form on "photos"', () => {
  const page = (o = {}, opts) => renderVenue({ slug: 'x', kind: 'schneider', name: 'X', address: { street: 'A 1', zip: '1040', city: 'Wien' }, theme: {},
    context: { near: [], facts: [], map: { w: 600, h: 340, streets: [], dots: [] } }, ...o }, opts);
  assert.match(page(), /<figure class="facade niche"><img src="\/v\/_shared\/niche\/(tailor|sewing-machine|tailor-[a-z]+)\.webp"/);
  assert.match(page(), /data-de="Symbolbild" data-en="Example image"/);
  assert.match(page(), /data-claim-open data-ev="niche" data-wish="photos"/);
  assert.match(page({ kind: 'imbiss', cuisine: 'pizza' }), /niche\/pizza/);
  // a confirmed page keeps the picture, without the owner button
  assert.match(page({ confirmed: true }), /class="facade niche"/);
  assert.ok(!page({ confirmed: true }).includes('data-wish="photos"'));
  // real photos win
  assert.ok(!page({ photos: ['__blob/venues/x/1.jpg'] }).includes('/niche/'));
  assert.ok(!page({ photos: ['foto-1.jpg'] }).includes('/niche/'));
  // a phone shop: its tools
  assert.match(page({ kind: 'handy' }), /niche\/phone-/);
  // nothing we surely know it sells (an imbiss with no known food, another trade): only the owner line, no frame, no picture
  for (const o of [{ kind: 'imbiss' }, { kind: 'other' }]) {
    assert.ok(!page(o).includes('/niche/'));
    assert.match(page(o), /class="nophoto"><button type="button" class="claimlink" data-claim-open data-ev="nophoto" data-wish="photos"/);
  }
  assert.ok(!page({ kind: 'other', confirmed: true }).includes('class="nophoto"'));
  assert.ok(!page().includes('placeholder-'));
});

test('Graz: the picture by district (roman numeral in the caption); Innere Stadt keeps the clock tower; an unknown area falls back to the city', async () => {
  const { districtArt } = await import('../../api/_lib/venues/around.mjs');
  const g = (area) => districtArt({ area, address: { zip: '8020', city: 'Graz' } });
  assert.match(g('Lend'), /districts\/graz-04\.webp/);
  assert.match(g('Lend'), /<figcaption>IV\. Lend · Kunsthaus Graz<\/figcaption>/);
  assert.match(g('Innere Stadt'), /districts\/graz\.webp/);
  assert.match(g('Innere Stadt'), /<figcaption>I\. Innere Stadt · Uhrturm am Schlossberg<\/figcaption>/);
  assert.match(g('Gösting'), /graz-13\.webp/);
  assert.match(g(undefined), /districts\/graz\.webp[\s\S]*<figcaption>Graz · Uhrturm am Schlossberg/);
});

test('osmFacts: cash only only when said, never beside a card yes; halal never from OSM (it comes from akiwi)', () => {
  assert.deepEqual(osmFacts({ 'payment:cash': 'only' }), ['cashOnly']);
  assert.deepEqual(osmFacts({ 'payment:cash': 'yes', 'payment:cards': 'no' }), ['cashOnly']);
  assert.deepEqual(osmFacts({ 'payment:cash': 'yes' }), []);
  assert.deepEqual(osmFacts({ 'payment:cash': 'yes', 'payment:debit_cards': 'no', 'payment:credit_cards': 'yes' }), ['cards']);
  assert.deepEqual(osmFacts({ 'diet:halal': 'yes' }), []);
});

test('the cash-only chip leads the chips in the sign colour', () => {
  const html = renderVenue({ slug: 'k', kind: 'imbiss', name: 'K', status: 'public', address: { street: 'A 1', zip: '1100', city: 'Wien' },
    context: { cuisine: ['kebab'], facts: ['terrace', 'cashOnly'] } });
  const chips = html.slice(html.indexOf('class="facts"'));
  assert.ok(chips.indexOf('class="key"') < chips.indexOf('class="food"'));
  assert.ok(chips.includes('Nur Barzahlung'));
});
