import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryStore } from './store.mjs';
import { sealOwnerKey, openOwnerKey, isAdmin, renderAdmin } from './admin.mjs';
import { handleAdmin } from './http.mjs';

const ADMIN = 'b'.repeat(32), OWNER = 'c'.repeat(32);
const hash = (k) => createHash('sha256').update(k).digest('hex');
const facts = (slug, extra = {}) => ({ slug, kind: 'cafe', name: 'Café ' + slug, area: 'Meidling',
  address: { street: 'Gasse 1', zip: '1120', city: 'Wien' }, internal: { district: 12 }, ...extra });

test('an owner key sealed with the admin key opens only with that key and that venue', () => {
  const enc = sealOwnerKey(ADMIN, 'cafe-a', OWNER);
  assert.ok(!enc.includes(OWNER));
  assert.equal(openOwnerKey(ADMIN, 'cafe-a', enc), OWNER);
  assert.equal(openOwnerKey('d'.repeat(32), 'cafe-a', enc), null);
  assert.equal(openOwnerKey(ADMIN, 'cafe-b', enc), null, 'cannot be moved to another venue');
  assert.equal(openOwnerKey(ADMIN, 'cafe-a', 'garbage'), null);
});

test('isAdmin compares against the stored hash only', () => {
  assert.equal(isAdmin(ADMIN, hash(ADMIN)), true);
  assert.equal(isAdmin('x', hash(ADMIN)), false);
  assert.equal(isAdmin('', hash(ADMIN)), false);
});

async function svc() {
  const store = memoryStore();
  await store.upsertFacts('cafe-a', { facts: facts('cafe-a'), keyHash: hash(OWNER), status: 'public' });
  await store.setOwnerKeyEnc('cafe-a', sealOwnerKey(ADMIN, 'cafe-a', OWNER));
  await store.upsertFacts('friseur-b', { facts: facts('friseur-b', { kind: 'friseur', name: 'Salon <B>' }), keyHash: 'h', status: 'public' });
  return { store, adminKeyHash: hash(ADMIN) };
}
const req = (k) => new Request(`https://www.namax.at/liste${k == null ? '' : '?k=' + k}`, { headers: { host: 'www.namax.at' } });

test('without the right key the list does not exist (404), and nothing about it leaks', async () => {
  for (const k of [null, '', 'x'.repeat(32)]) {
    const res = await handleAdmin(req(k), await svc());
    assert.equal(res.status, 404);
    assert.doesNotMatch(await res.text(), /cafe-a|Café/);
  }
});

test('with the key: every venue, its page, its owner link, search; private and not indexed', async () => {
  const res = await handleAdmin(req(ADMIN), await svc());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  const html = await res.text();
  for (const s of ['Café cafe-a', 'https://cafe-a.namax.at/', `https://cafe-a.namax.at/?k=${OWNER}`, 'type="search"', 'Salon &lt;B&gt;'])
    assert.ok(html.includes(s), s);
  assert.ok(!html.includes('friseur-b.namax.at/?k='), 'no owner link when no sealed key is stored');
});

test('renderAdmin escapes data and groups nothing it was not given', () => {
  const html = renderAdmin([{ slug: 'x-y', name: '"><script>', kind: 'cafe', street: 'S', district: 12, status: 'public', confirmed: false, ownerUrl: null }]);
  assert.ok(!html.includes('"><script>'));
});
