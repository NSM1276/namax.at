import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateVenue, RESERVED_SLUGS } from './schema.mjs';
const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));

test('full and minimal fixtures are valid', () => {
  assert.deepEqual(validateVenue(load('full'), 'friseur-meidling'), []);
  assert.deepEqual(validateVenue(load('minimal'), 'minimal'), []);
});
test('slug must match file name', () => {
  assert.match(validateVenue(load('full'), 'other-name').join('\n'), /slug/);
});
test('bad slugs are rejected', () => {
  for (const slug of ['Friseur', 'frisör', 'a', '-x-', 'a--b', ...RESERVED_SLUGS]) {
    const errs = validateVenue({ ...load('minimal'), slug }, slug);
    assert.ok(errs.length > 0, slug);
  }
});
test('unknown status and kind are rejected', () => {
  assert.ok(validateVenue({ ...load('minimal'), status: 'live' }, 'minimal').length);
  assert.ok(validateVenue({ ...load('minimal'), kind: 'bank' }, 'minimal').length);
});
test('missing required fields are rejected', () => {
  for (const k of ['name', 'address', 'kind', 'status']) {
    const v = load('minimal'); delete v[k];
    assert.ok(validateVenue(v, 'minimal').length, k);
  }
  assert.ok(validateVenue(null, 'minimal').length);
});
test('hours must be 7 entries of null or [open, close] within 0..1440', () => {
  assert.ok(validateVenue({ ...load('minimal'), hours: [[540, 1140]] }, 'minimal').length);
  assert.ok(validateVenue({ ...load('minimal'), hours: Array(7).fill([540, 2000]) }, 'minimal').length);
});
test('more than 4 photos, negative price, rating outside 1..5 are rejected', () => {
  const m = load('minimal');
  assert.ok(validateVenue({ ...m, photos: ['a', 'b', 'c', 'd', 'e'] }, 'minimal').length);
  assert.ok(validateVenue({ ...m, rating: { value: 6, count: 1, source: 'Google', date: '2026-11' } }, 'minimal').length);
  assert.ok(validateVenue({ ...m, list: { asOf: '2026-11', groups: [{ title: { de: 'x', en: 'x' }, items: [{ name: 'x', price: -1 }] }] } }, 'minimal').length);
});
