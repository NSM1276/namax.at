import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overtureIndex } from '../city/overture.mjs';
import { planOverture } from './overture-apply.mjs';

const fx = JSON.parse(readFileSync(new URL('../city/fixtures/overture-sample.json', import.meta.url), 'utf8'));
const index = overtureIndex(fx.places);
const hours = [null, [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1140], null];
const rec = (slug, extra = {}) => {
  const v = fx.venues.find((x) => x.slug === slug);
  return { slug, status: 'public', confirmedAt: null, facts: { slug, kind: v.kind, name: v.name, hours, address: { street: v.street, zip: v.zip, city: 'Wien' },
    source: 'osm', internal: { lat: v.lat, lon: v.lon, district: 10 } }, ...extra };
};

test('planOverture hides a closed page, keeps hand facts, and uses coords from the city file when facts lack them', () => {
  const noCoords = rec('mali-thai-kueche');
  delete noCoords.facts.internal.lat; delete noCoords.facts.internal.lon;
  noCoords.facts.list = { groups: [] };
  const v = fx.venues.find((x) => x.slug === 'mali-thai-kueche');
  const plan = planOverture([rec('ocean-handy'), noCoords, rec('jamila-coffee')],
    { index, release: '2026-11-18', coords: new Map([['mali-thai-kueche', { lat: v.lat, lon: v.lon }]]) });
  const [closed, thai, unknown] = plan;
  assert.equal(closed.status, 'hidden');
  assert.equal(closed.facts.internal.overture.hidPage, true);
  assert.equal(thai.opinion.verdict, 'both');
  assert.deepEqual(thai.facts.list, { groups: [] });
  assert.equal(thai.facts.uncertain, undefined);
  assert.deepEqual(unknown.facts.uncertain, ['hours']);
  assert.equal(unknown.status, 'public');
});

test('planOverture run twice changes nothing the second time', () => {
  const first = planOverture([rec('ocean-handy'), rec('jamila-coffee')], { index, release: 'r' });
  const again = planOverture(first.map((p) => ({ slug: p.slug, status: p.status, confirmedAt: null, facts: p.facts })), { index, release: 'r' });
  assert.deepEqual(again.map((p) => p.changed), [false, false]);
});
