import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryStore } from './store.mjs';
import { sealOwnerKey, openOwnerKey, isAdmin, renderAdmin } from './admin.mjs';
import { handleAdmin, handleAdminRotate, handleAdminPost, MAX_FACADE_BYTES } from './http.mjs';

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

// Facade photo: Nasim adds a cropped photo of the front from the private list.
const fakeBlob = () => {
  const b = { puts: [], deleted: [] };
  b.put = async (path, bytes, opts) => { b.puts.push({ path, bytes, opts }); return { url: 'https://abc.public.blob.vercel-storage.com/' + path }; };
  b.del = async (urls) => { b.deleted.push(...[].concat(urls)); };
  return b;
};
const jpegBytes = (n = 2000) => { const a = new Uint8Array(n); a.set([0xff, 0xd8, 0xff, 0xe0]); return a; };
const facadeReq = (fields) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Uint8Array) form.append(k, new Blob([v], { type: 'image/jpeg' }), 'f.jpg'); else form.append(k, v);
  }
  return new Request('https://www.namax.at/liste', { method: 'POST', headers: { host: 'www.namax.at' }, body: form });
};
async function facadeSvc() { const s = await svc(); s.blob = fakeBlob(); return s; }

test('facade: upload stores one file per venue, a second upload deletes the first, delete clears it', async () => {
  const s = await facadeSvc();
  const r1 = await handleAdminPost(facadeReq({ k: ADMIN, slug: 'cafe-a', photo: jpegBytes() }), s);
  assert.equal(r1.status, 200);
  const { url: u1 } = await r1.json();
  assert.match(s.blob.puts[0].path, /^venues\/cafe-a\/facade-[0-9a-f]{32}\.jpg$/);
  assert.equal((await s.store.getVenue('cafe-a')).facadeUrl, u1);
  assert.equal((await s.store.listForAdmin()).find((r) => r.slug === 'cafe-a').facadeUrl, u1);
  const { url: u2 } = await (await handleAdminPost(facadeReq({ k: ADMIN, slug: 'cafe-a', photo: jpegBytes() }), s)).json();
  assert.notEqual(u1, u2);
  assert.deepEqual(s.blob.deleted, [u1]);
  const r3 = await handleAdminPost(facadeReq({ k: ADMIN, slug: 'cafe-a', delete: '1' }), s);
  assert.equal(r3.status, 200);
  assert.deepEqual(await r3.json(), { url: null });
  assert.equal((await s.store.getVenue('cafe-a')).facadeUrl, null);
  assert.deepEqual(s.blob.deleted, [u1, u2]);
});

test('facade: no key, wrong key, unknown or removed venue → 404 and nothing stored; text → 415; too big → 413', async () => {
  const s = await facadeSvc();
  for (const k of ['', 'x'.repeat(32)]) assert.equal((await handleAdminPost(facadeReq({ k, slug: 'cafe-a', photo: jpegBytes() }), s)).status, 404);
  assert.equal((await handleAdminPost(facadeReq({ slug: 'cafe-a', photo: jpegBytes() }), s)).status, 404);
  assert.equal((await handleAdminPost(facadeReq({ k: ADMIN, slug: 'nope', photo: jpegBytes() }), s)).status, 404);
  await s.store.setStatus('friseur-b', 'removed');
  assert.equal((await handleAdminPost(facadeReq({ k: ADMIN, slug: 'friseur-b', photo: jpegBytes() }), s)).status, 404);
  assert.equal(s.blob.puts.length, 0);
  assert.equal((await handleAdminPost(facadeReq({ k: ADMIN, slug: 'cafe-a', photo: new TextEncoder().encode('hello world, not an image') }), s)).status, 415);
  assert.equal((await handleAdminPost(facadeReq({ k: ADMIN, slug: 'cafe-a', photo: jpegBytes(MAX_FACADE_BYTES + 10) }), s)).status, 413);
  assert.equal(s.blob.puts.length, 0);
});

test('facade: a JSON post still rotates the owner link', async () => {
  const s = await facadeSvc();
  const res = await handleAdminPost(rotateReq({ k: ADMIN, slug: 'cafe-a' }), s);
  assert.equal(res.status, 200);
  assert.match((await res.json()).ownerUrl, /^https:\/\/cafe-a\.namax\.at\/\?k=[0-9a-f]{32}$/);
});

test('list card: "Foto" button; with a facade a thumbnail and "Foto löschen"; the picker is the plain chooser (camera or gallery)', () => {
  const row = (slug, facadeUrl) => ({ slug, name: 'N ' + slug, kind: 'cafe', street: 'S', district: 12, status: 'public', confirmed: false, ownerUrl: null, facadeUrl });
  const url = 'https://abc.public.blob.vercel-storage.com/venues/with-f/facade-1.jpg';
  const html = renderAdmin([row('with-f', url), row('no-f', null)]);
  const card = (slug) => html.split('<li ').find((c) => c.includes(`data-name="N ${slug}"`)).split('</li>')[0];
  assert.match(card('with-f'), /data-facade="with-f"[^>]*>Foto</);
  assert.ok(card('with-f').includes(`<img class="th" src="${url}"`), 'thumbnail');
  assert.match(card('with-f'), /data-fdel="with-f"[^>]*>Foto löschen</);
  assert.match(card('no-f'), /data-facade="no-f"[^>]*>Foto</);
  assert.ok(!card('no-f').includes('<img'), 'no thumbnail without a photo');
  assert.match(card('no-f'), /data-frow[^>]* data-none/);
  assert.match(html, /<input type="file" accept="image\/\*"/);
  assert.doesNotMatch(html, /capture/);
  for (const s of ['1600', '1200', '0.82', 'Verwenden', 'Neu wählen', 'Abbrechen', 'type="range"']) assert.ok(html.includes(s), s);
});

test('list passes the facade url from the store to the card', async () => {
  const s = await svc();
  await s.store.setFacade('cafe-a', 'https://abc.public.blob.vercel-storage.com/venues/cafe-a/facade-9.jpg');
  const html = await (await handleAdmin(req(ADMIN), s)).text();
  assert.ok(html.includes('<img class="th" src="https://abc.public.blob.vercel-storage.com/venues/cafe-a/facade-9.jpg"'));
});
