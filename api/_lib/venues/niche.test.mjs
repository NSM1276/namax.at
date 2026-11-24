import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { nicheImage, NICHE, CUISINE, NEUTRAL } from './niche.mjs';

const v = (kind, cuisine, slug = 'x') => ({ slug, kind, ...(cuisine ? { cuisine } : {}) });
const name = (p) => p && p.replace('/v/_shared/niche/', '').replace('.webp', '');

test('trades get a picture of their own tools', () => {
  for (const k of ['friseur', 'schneider', 'nails', 'kosmetik', 'cafe', 'handy']) assert.ok(NICHE[k].includes(name(nicheImage(v(k)))), k);
  assert.match(name(nicheImage(v('handy'))), /^phone-/);
});

test('food follows the cuisine; the first known cuisine wins', () => {
  assert.match(name(nicheImage(v('restaurant', 'pizza'))), /^pizza/);
  assert.match(name(nicheImage(v('imbiss', 'kebab;pizza'))), /^(doener|dueruem|kebab|adana)$/);
  assert.match(name(nicheImage(v('restaurant', 'sushi'))), /^sushi/);
  assert.equal(name(nicheImage(v('imbiss', 'burger;chinese'))), 'burger');
  assert.equal(name(nicheImage(v('restaurant', 'thai'))), 'thai-curry');
  assert.equal(name(nicheImage(v('imbiss', 'unknown;korean'))), 'bibimbap');
  assert.ok(CUISINE.austrian.includes(name(nicheImage(v('restaurant', 'Austrian')))));
});

test('never a guessed dish: unknown or missing cuisine gets a laid table or a takeaway bag', () => {
  assert.match(name(nicheImage(v('restaurant'))), /^table-setting/);
  assert.match(name(nicheImage(v('restaurant', 'international'))), /^table-setting/);
  assert.match(name(nicheImage(v('imbiss', 'sandwich'))), /^takeaway/);
  assert.equal(nicheImage(v('other')), null);
});

test('the same page always gets the same picture; neighbours can differ', () => {
  assert.equal(nicheImage(v('friseur', null, 'kardash')), nicheImage(v('friseur', null, 'kardash')));
  const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => nicheImage(v('friseur', null, s))));
  assert.ok(seen.size > 1);
});

test('every picture the table names is in v/_shared/niche', () => {
  const all = new Set([...Object.values(NICHE), ...Object.values(CUISINE), ...Object.values(NEUTRAL)].flat());
  for (const n of all) assert.ok(existsSync(new URL(`../../../v/_shared/niche/${n}.webp`, import.meta.url)), n);
});
