import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryStore } from './store.mjs';
import { sealOwnerKey, openOwnerKey, isAdmin, renderAdmin } from './admin.mjs';
import { handleAdmin, handleAdminRotate } from './http.mjs';

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

const rotateReq = (body) => new Request('https://www.namax.at/liste', { method: 'POST', headers: { host: 'www.namax.at', 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('"new link" replaces the owner key: the old link stops working, the list shows the new one', async () => {
  const s = await svc();
  const res = await handleAdminRotate(rotateReq({ k: ADMIN, slug: 'cafe-a' }), s);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const { ownerUrl } = await res.json();
  const m = /^https:\/\/cafe-a\.namax\.at\/\?k=([0-9a-f]{32})$/.exec(ownerUrl);
  assert.ok(m, ownerUrl);
  assert.notEqual(m[1], OWNER);
  const v = await s.store.getVenue('cafe-a');
  assert.equal(v.keyHash, hash(m[1]), 'new key works');
  assert.notEqual(v.keyHash, hash(OWNER), 'old key no longer works');
  assert.ok((await (await handleAdmin(req(ADMIN), s)).text()).includes(ownerUrl));
});

test('"new link" also gives a link to a venue that had none, and refuses without the admin key or for unknown venues', async () => {
  const s = await svc();
  const ok = await handleAdminRotate(rotateReq({ k: ADMIN, slug: 'friseur-b' }), s);
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).ownerUrl, /^https:\/\/friseur-b\.namax\.at\/\?k=/);
  for (const body of [{ slug: 'cafe-a' }, { k: 'x'.repeat(32), slug: 'cafe-a' }]) {
    const r = await handleAdminRotate(rotateReq(body), s);
    assert.equal(r.status, 404);
  }
  assert.equal((await s.store.getVenue('cafe-a')).keyHash, hash(OWNER), 'unchanged after refused attempts');
  assert.equal((await handleAdminRotate(rotateReq({ k: ADMIN, slug: 'nope' }), s)).status, 404);
  await s.store.setStatus('cafe-a', 'removed');
  assert.equal((await handleAdminRotate(rotateReq({ k: ADMIN, slug: 'cafe-a' }), s)).status, 404, 'removed pages get no new link');
});

test('renderAdmin offers a "new link" button for every venue', () => {
  const html = renderAdmin([{ slug: 'x-y', name: 'N', kind: 'cafe', street: 'S', district: 12, status: 'public', confirmed: false, ownerUrl: null }]);
  assert.match(html, /data-rotate="x-y"/);
  assert.match(html, /Neuer Link/);
  assert.match(html, /<html lang="de">/);
  assert.doesNotMatch(html, /[А-Яа-яЁё]/, "the list is in German: owners may see the screen");
});

test('every script in the list is closed and parses (search, chips and QR all depend on it)', () => {
  const html = renderAdmin([{ slug: 'x-y', name: 'N', kind: 'cafe', street: 'S', district: 12, status: 'public', confirmed: false, ownerUrl: null }]);
  assert.equal((html.match(/<script\b/g) || []).length, (html.match(/<\/script>/g) || []).length);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  assert.match(html, /addEventListener\('input'/);
});
