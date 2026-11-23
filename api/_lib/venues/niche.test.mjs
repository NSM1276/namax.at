import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { nicheImage, NICHE, CUISINE } from './niche.mjs';

const v = (kind, cuisine, slug = 'x') => ({ slug, kind, ...(cuisine ? { cuisine } : {}) });
const name = (p) => p && p.replace('/v/_shared/niche/', '').replace('.webp', '');

test('trades get a picture of their own tools', () => {
  assert.match(name(nicheImage(v('friseur'))), /^(hair|barber)$/);
  assert.equal(name(nicheImage(v('schneider'))), 'tailor');
  assert.equal(name(nicheImage(v('nails'))), 'nails');
  assert.equal(name(nicheImage(v('kosmetik'))), 'cosmetics');
  assert.match(name(nicheImage(v('cafe'))), /^(coffee|cake|breakfast)$/);
});

test('food follows the cuisine; the first known cuisine wins', () => {
  assert.match(name(nicheImage(v('restaurant', 'pizza'))), /^pizza/);
  assert.match(name(nicheImage(v('imbiss', 'kebab;pizza'))), /^(doener|dueruem|kebab|adana)$/);
  assert.match(name(nicheImage(v('restaurant', 'sushi'))), /^sushi/);
  assert.equal(name(nicheImage(v('imbiss', 'chinese;burger'))), 'burger');
  assert.equal(name(nicheImage(v('restaurant', 'Austrian'))), 'schnitzel');
});

test('never a guessed dish: unknown or missing cuisine, or a trade without a picture, gives nothing', () => {
  assert.equal(nicheImage(v('restaurant')), null);
  assert.equal(nicheImage(v('imbiss', 'chinese')), null);
  assert.equal(nicheImage(v('handy')), null);
  assert.equal(nicheImage(v('other')), null);
});

test('the same page always gets the same picture; neighbours can differ', () => {
  assert.equal(nicheImage(v('friseur', null, 'kardash')), nicheImage(v('friseur', null, 'kardash')));
  const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => nicheImage(v('friseur', null, s))));
  assert.equal(seen.size, 2);
});

test('every picture the table names is in v/_shared/niche', () => {
  const all = new Set([...Object.values(NICHE), ...Object.values(CUISINE)].flat());
  for (const n of all) assert.ok(existsSync(new URL(`../../../v/_shared/niche/${n}.webp`, import.meta.url)), n);
});
