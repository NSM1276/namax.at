import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGEABLE, effectiveVenue, checkChanges } from './merge.mjs';
import { renderVenue } from './template.mjs';
import { validateVenue } from './schema.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const record = (facts, extra = {}) => ({ slug: facts.slug, keyHash: 'h', status: 'public', facts, changes: {},
  pending: null, confirmedAt: null, doNotContact: false, chatState: {}, ...extra });
const SAT_17 = [null, [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1020]];
const blob = (n) => `https://abc.public.blob.vercel-storage.com/venues/x/${n}.jpg`;

test('CHANGEABLE is exactly the data the owner may change', () => {
  assert.deepEqual(CHANGEABLE, ['phone', 'hours', 'list', 'facts']);
});

test('a change of hours shows and leaves facts untouched', () => {
  const r = record(load('full'), { changes: { hours: SAT_17 } });
  const v = effectiveVenue(r, []);
  assert.deepEqual(v.hours, SAT_17);
  assert.notDeepEqual(r.facts.hours, SAT_17);
});

test('changes.list replaces the whole list', () => {
  const list = { asOf: '2026-11', groups: [{ items: [{ name: 'Bart', price: 8 }] }] };
  const v = effectiveVenue(record(load('full'), { changes: { list } }), []);
  assert.deepEqual(v.list, list);
});

test('status comes from the record, confirmed from confirmedAt, internal never shows', () => {
  const f = { ...load('full'), status: 'hidden', internal: { owner: 'SECRET' } };
  const v = effectiveVenue(record(f, { status: 'public', confirmedAt: '2026-11-21T10:00:00Z' }), []);
  assert.equal(v.status, 'public');
  assert.equal(v.confirmed, true);
  assert.equal(v.internal, undefined);
  assert.equal(effectiveVenue(record(f), []).confirmed, false);
});

test('only shown photos, never more than 4', () => {
  const photos = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, url: blob('p' + i), kind: i === 2 ? 'priceboard' : 'show' }));
  const v = effectiveVenue(record(load('minimal')), photos);
  assert.deepEqual(v.photos, [blob('p1'), blob('p3'), blob('p4'), blob('p5')]);
  assert.equal(effectiveVenue(record(load('minimal')), []).photos, undefined);
});

test('uncertain blocks are dropped until the owner confirms or changes them', () => {
  const f = { ...load('full'), uncertain: ['hours', 'phone', 'list'] };
  const plain = effectiveVenue(record(f), []);
  assert.equal(plain.hours, undefined); assert.equal(plain.phone, undefined); assert.equal(plain.list, undefined);
  const changed = effectiveVenue(record(f, { changes: { hours: SAT_17 } }), []);
  assert.deepEqual(changed.hours, SAT_17); assert.equal(changed.phone, undefined);
  const confirmed = effectiveVenue(record(f, { confirmedAt: '2026-11-21T10:00:00Z' }), []);
  assert.ok(confirmed.hours && confirmed.phone && confirmed.list);
  assert.equal(confirmed.uncertain, undefined);
});

test('an uncertain address stays on the page (it is required)', () => {
  const f = { ...load('minimal'), uncertain: ['address'] };
  assert.deepEqual(effectiveVenue(record(f), []).address, f.address);
});

test('checkChanges accepts valid data', () => {
  const r = record(load('full'));
  assert.deepEqual(checkChanges(r, { hours: SAT_17, phone: '+4312345678' }), { ok: true, changes: { hours: SAT_17, phone: '+4312345678' } });
});

test('checkChanges refuses fields outside CHANGEABLE', () => {
  const r = record(load('full'));
  for (const c of [{ status: 'public' }, { name: 'x' }, { slug: 'y' }, { theme: { palette: 'red-yellow' } }, { photos: [] }, { internal: {} }]) {
    const res = checkChanges(r, c);
    assert.equal(res.ok, false, JSON.stringify(c));
    assert.ok(res.problems.length);
  }
  assert.equal(checkChanges(r, {}).ok, false, 'an empty change is no change');
});

test('checkChanges refuses bad values with a readable problem', () => {
  const r = record(load('full'));
  const bad = [
    { list: { asOf: '2026-11', groups: [{ items: [{ name: 'Bart', price: -5 }] }] } },
    { hours: [null, [1500, 20], null, null, null, null, null] },
    { list: { asOf: '2026-11', groups: [{ items: Array.from({ length: 41 }, (_, i) => ({ name: 'P' + i, price: 1 })) }] } },
    { phone: 'call me' },
  ];
  for (const c of bad) {
    const res = checkChanges(r, c);
    assert.equal(res.ok, false, JSON.stringify(c).slice(0, 60));
    assert.ok(res.problems.every((p) => typeof p === 'string' && p.length > 3));
  }
});

test('photos may be Blob URLs or plain file names, nothing else', () => {
  const m = load('minimal');
  assert.deepEqual(validateVenue({ ...m, photos: [blob('a'), 'foto-1.jpg'] }, 'minimal'), []);
  for (const p of ['https://evil.com/a.jpg', 'http://abc.public.blob.vercel-storage.com/a.jpg',
    'https://abc.public.blob.vercel-storage.com/a.svg', 'foto-1xjpg', 'javascript:alert(1)']) {
    assert.ok(validateVenue({ ...m, photos: [p] }, 'minimal').length, p);
  }
  const html = renderVenue({ ...m, photos: [blob('a'), 'foto-1.jpg'] });
  assert.ok(html.includes(`src="${blob('a')}"`));
  assert.ok(html.includes('src="/foto-1.jpg"'));
});

test('footer: unconfirmed line follows venue.confirmed; OSM data is credited', () => {
  const f = load('full');
  assert.ok(renderVenue({ ...f, status: 'public' }).includes('nicht vom Inhaber bestätigt'));
  assert.ok(!renderVenue({ ...f, status: 'public', confirmed: true }).includes('nicht vom Inhaber bestätigt'));
  const osm = renderVenue({ ...f, source: 'osm' });
  assert.ok(osm.includes('OpenStreetMap'));
  assert.ok(osm.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(!renderVenue(f).includes('OpenStreetMap'));
});

test('footer: a page checked against Overture Maps credits it; internal facts stay off the page', () => {
  const f = load('full');
  const v = effectiveVenue(record({ ...f, internal: { overture: { verdict: 'both', release: '2026-11-18.0', match: { phone: '+4399' } } } }));
  assert.equal(v.internal, undefined);
  const html = renderVenue(v);
  assert.ok(html.includes('Overture Maps Foundation'));
  assert.ok(!html.includes('+4399'));
  assert.ok(!renderVenue(effectiveVenue(record(f))).includes('Overture'));
});
