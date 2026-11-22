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
// The list remembers Nasim with a cookie; ?k= only logs in and redirects (tested below).
const req = (k, d = '12') => {
  const q = new URLSearchParams();
  if (d) q.set('d', d);
  const headers = { host: 'www.namax.at' };
  if (k != null) headers.cookie = `other=1; namax_admin=${k}`;
  return new Request(`https://www.namax.at/liste${q.size ? '?' + q : ''}`, { headers });
};

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

const rotateReq = (body, cookie) => new Request('https://www.namax.at/liste', { method: 'POST',
  headers: { host: 'www.namax.at', 'content-type': 'application/json', ...(cookie ? { cookie: `namax_admin=${cookie}` } : {}) }, body: JSON.stringify(body) });

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

// The list opens one district at a time, so it stays light on a phone however many districts are loaded.
async function twoDistricts() {
  const s = await svc();
  await s.store.upsertFacts('kebab-x', { facts: facts('kebab-x', { kind: 'imbiss', name: 'Kebab X', internal: { district: 10 } }), keyHash: 'h', status: 'public' });
  return s;
}
const cards = (html) => (html.match(/<li /g) || []).length;

test('list: ?d= shows only that district; d=all shows everything', async () => {
  const s = await twoDistricts();
  const h12 = await (await handleAdmin(req(ADMIN, '12'), s)).text();
  assert.equal(cards(h12), 2); assert.ok(!h12.includes('Kebab X'));
  const h10 = await (await handleAdmin(req(ADMIN, '10'), s)).text();
  assert.equal(cards(h10), 1); assert.ok(h10.includes('Kebab X'));
  assert.equal(cards(await (await handleAdmin(req(ADMIN, 'all'), s)).text()), 3);
});

test('list without a district: a chooser with every district and its count, no cards, no key in the page', async () => {
  const s = await twoDistricts();
  for (const d of ['', '99', 'x']) {
    const res = await handleAdmin(req(ADMIN, d), s);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.equal(cards(html), 0, d);
    assert.match(html, /data-pick="10"[^>]*>10\. Favoriten <span>1<\/span>/);
    assert.match(html, /data-pick="12"[^>]*>12\. Meidling <span>2<\/span>/);
    assert.ok(html.includes('data-pick="all"'));
    assert.ok(!html.includes(ADMIN), 'the admin key is never written into the page');
  }
});

test('list: the district menu switches districts and keeps the current one selected', async () => {
  const html = await (await handleAdmin(req(ADMIN, '10'), await twoDistricts())).text();
  assert.match(html, /<option value="10" selected>10\. Favoriten \(1\)<\/option>/);
  assert.match(html, /<option value="12">12\. Meidling \(2\)<\/option>/);
  assert.ok(!html.includes(ADMIN));
});

// Overture Maps second opinion: Nasim sees which pages to check and can show or hide a page himself.
const ov = (verdict, extra = {}) => ({ overture: { verdict, release: '2026-11-18.0', ...extra } });
async function overtureSvc() {
  const s = await svc();
  await s.store.upsertFacts('cafe-a', { facts: facts('cafe-a', { internal: { district: 12, ...ov('both', { match: { name: 'Café A', phone: '+4311234', website: 'https://cafe-a.at' } }) } }), keyHash: hash(OWNER), status: 'public' });
  await s.store.upsertFacts('friseur-b', { facts: facts('friseur-b', { kind: 'friseur', name: 'Salon <B>', internal: { district: 12, ...ov('other', { other: { name: 'Mo Barbershop' } }) } }), keyHash: 'h', status: 'public' });
  await s.store.upsertFacts('cafe-c', { facts: facts('cafe-c', { internal: { district: 12, ...ov('closed', { match: { name: 'Café C', status: 'permanently_closed' }, hidPage: true }) } }), keyHash: 'h', status: 'hidden' });
  await s.store.upsertFacts('cafe-d', { facts: facts('cafe-d', { internal: { district: 12, ...ov('osm') } }), keyHash: 'h', status: 'public' });
  return s;
}
const card = (html, slug) => html.split('<li ').find((c) => c.includes(`data-name="${slug === 'friseur-b' ? 'Salon &lt;B&gt;' : 'Café ' + slug}"`)) || '';

test('list card: the Overture verdict as a badge, the Overture line, and data-check for the filter', async () => {
  const html = await (await handleAdmin(req(ADMIN), await overtureSvc())).text();
  assert.match(card(html, 'cafe-a'), /data-check="both"/);
  assert.match(card(html, 'cafe-a'), /2 Quellen/);
  assert.match(card(html, 'cafe-a'), /href="tel:\+4311234"/);
  assert.match(card(html, 'cafe-a'), /cafe-a\.at/);
  assert.match(card(html, 'friseur-b'), /data-check="other"/);
  assert.match(card(html, 'friseur-b'), /anderes Geschäft: Mo Barbershop\?/);
  assert.match(card(html, 'cafe-c'), /data-check="closed"/);
  assert.match(card(html, 'cafe-c'), /geschlossen\?/);
  assert.match(card(html, 'cafe-d'), /nur OSM/);
  assert.match(html, /data-only-check/, 'a "Nur prüfen" filter');
  assert.match(html, /Nur prüfen/);
});

test('list card: a hidden page gets "Seite zeigen", a public one "Seite verstecken"', async () => {
  const html = await (await handleAdmin(req(ADMIN), await overtureSvc())).text();
  assert.match(card(html, 'cafe-c'), /data-status="public"[^>]*data-slug="cafe-c"[^>]*>Seite zeigen/);
  assert.match(card(html, 'cafe-a'), /data-status="hidden"[^>]*data-slug="cafe-a"[^>]*>Seite verstecken/);
});

test('POST {k, slug, status} shows or hides a page; only public/hidden; no key or removed → 404', async () => {
  const s = await overtureSvc();
  const post = (body) => handleAdminPost(rotateReq(body), s);
  const r = await post({ k: ADMIN, slug: 'cafe-c', status: 'public' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'public' });
  assert.equal((await s.store.getVenue('cafe-c')).status, 'public');
  assert.equal((await post({ k: ADMIN, slug: 'cafe-c', status: 'hidden' })).status, 200);
  assert.equal((await s.store.getVenue('cafe-c')).status, 'hidden');
  assert.equal((await post({ k: ADMIN, slug: 'cafe-c', status: 'removed' })).status, 400);
  assert.equal((await post({ k: 'x'.repeat(32), slug: 'cafe-c', status: 'public' })).status, 404);
  await s.store.setStatus('cafe-d', 'removed');
  assert.equal((await post({ k: ADMIN, slug: 'cafe-d', status: 'public' })).status, 404);
  assert.equal((await s.store.getVenue('cafe-d')).status, 'removed');
  const keyBefore = (await s.store.getVenue('cafe-a')).keyHash;
  await post({ k: ADMIN, slug: 'cafe-a', status: 'hidden' });
  assert.equal((await s.store.getVenue('cafe-a')).keyHash, keyBefore, 'showing or hiding never changes the owner link');
});

// Owner requests and the remembered login.
test('login: ?k= sets the cookie and redirects to the same address without the key', async () => {
  const s = await svc();
  const res = await handleAdmin(new Request(`https://www.namax.at/liste?k=${ADMIN}&d=12`, { headers: { host: 'www.namax.at' } }), s);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/liste?d=12');
  assert.equal(res.headers.get('set-cookie'), `namax_admin=${ADMIN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const bad = await handleAdmin(new Request(`https://www.namax.at/liste?k=${'x'.repeat(32)}`, { headers: { host: 'www.namax.at' } }), s);
  assert.equal(bad.status, 404);
  assert.equal(bad.headers.get('set-cookie'), null);
});

test('cookie alone opens the list; the client code never reads the key from the address', async () => {
  const res = await handleAdmin(req(ADMIN), await svc());
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!html.includes("get('k')"));
  assert.ok(!html.includes(ADMIN));
});

async function reqSvc() {
  const s = await svc();
  const a = await s.store.addRequest('cafe-a', { role: 'staff', wish: 'fix', name: 'Ali <i>', phone: '+43 660 1234567', channel: 'call', text: 'Zeiten <script>' });
  const b = await s.store.addRequest('friseur-b', { role: 'owner', wish: 'website', name: 'Mo', phone: '0664 765 43 21', channel: 'whatsapp', text: '' });
  const c = await s.store.addRequest('cafe-a', { role: 'other', wish: 'remove', name: '', phone: '01 234 5678', channel: 'call', text: '' });
  await s.store.setRequestDone(c, true);
  return { ...s, ids: { a, b, c } };
}
const chooser = async (s) => (await handleAdmin(req(ADMIN, ''), s)).text();

test('start page: "Anfragen" with the open count above the districts, website wishes first, escaped, done ones folded', async () => {
  const html = await chooser(await reqSvc());
  assert.ok(html.indexOf('Anfragen') < html.indexOf('data-pick="12"'));
  assert.match(html, /Anfragen <span>2<\/span>/);
  assert.ok(html.indexOf('>Mo<') < html.indexOf('Ali &lt;i&gt;'), 'own-website wish first');
  assert.ok(html.includes('Familie / Mitarbeiter · Angaben korrigieren · Anruf'));
  assert.ok(html.includes('Inhaber/in · Eigene Website · WhatsApp'));
  assert.ok(html.includes('Website!'));
  assert.ok(html.includes('Ali &lt;i&gt;') && html.includes('Zeiten &lt;script&gt;'));
  assert.ok(!html.includes('Zeiten <script>'));
  assert.match(html, /<details[^>]*><summary>Erledigt \(1\)<\/summary>[\s\S]*Seite entfernen/);
  assert.ok(html.includes('href="https://cafe-a.namax.at/"'));
  assert.match(html, /<body data-open="2">/, 'the start page stays put while requests are open');
});

test('request card: the main button answers the way the owner chose, on the number they typed', async () => {
  const html = await chooser(await reqSvc());
  assert.ok(html.includes('href="tel:+436601234567"'));
  assert.ok(html.includes('href="https://wa.me/436647654321"'), 'Austrian 0664… becomes 43664…');
});

test('POST requestId done → marked done and back; without admin → 404', async () => {
  const s = await reqSvc();
  const r = await handleAdminPost(rotateReq({ requestId: s.ids.a, done: true }, ADMIN), s);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { done: true });
  assert.ok((await s.store.listRequests()).find((x) => x.id === s.ids.a).doneAt);
  await handleAdminPost(rotateReq({ requestId: s.ids.a, done: false }, ADMIN), s);
  assert.equal((await s.store.listRequests()).find((x) => x.id === s.ids.a).doneAt, null);
  assert.equal((await handleAdminPost(rotateReq({ requestId: s.ids.a, done: true }), s)).status, 404);
  assert.equal((await handleAdminPost(rotateReq({ requestId: s.ids.a, done: true }, 'x'.repeat(32)), s)).status, 404);
  assert.equal((await s.store.listRequests()).find((x) => x.id === s.ids.a).doneAt, null);
});

test('chat switch: POST {slug, chatOpen} opens and closes the chat; cards and requests show it', async () => {
  const s = await reqSvc();
  let html = await chooser(s);
  assert.match(html, /data-chat="cafe-a" data-to="1"[^>]*>Chat freischalten/);
  const r = await handleAdminPost(rotateReq({ slug: 'cafe-a', chatOpen: true }, ADMIN), s);
  assert.deepEqual(await r.json(), { chatOpen: true });
  assert.equal((await s.store.getVenue('cafe-a')).chatOpen, true);
  html = await chooser(s);
  assert.match(html, /data-chat="cafe-a" data-to="0"[^>]*>Chat sperren/);
  const cardsHtml = await (await handleAdmin(req(ADMIN), s)).text();
  assert.match(card(cardsHtml, 'cafe-a'), /Chat offen/);
  assert.match(card(cardsHtml, 'cafe-a'), /data-chat="cafe-a" data-to="0"/);
  assert.match(card(cardsHtml, 'friseur-b'), /data-chat="friseur-b" data-to="1"[^>]*>Chat freischalten/);
  assert.equal((await handleAdminPost(rotateReq({ slug: 'cafe-a', chatOpen: false }), s)).status, 404);
  assert.equal((await s.store.getVenue('cafe-a')).chatOpen, true);
});

test('rotate, show/hide and facade work with the cookie alone', async () => {
  const s = await overtureSvc();
  s.blob = fakeBlob();
  const r = await handleAdminPost(rotateReq({ slug: 'cafe-a' }, ADMIN), s);
  assert.equal(r.status, 200);
  assert.match((await r.json()).ownerUrl, /^https:\/\/cafe-a\.namax\.at\/\?k=/);
  assert.equal((await handleAdminPost(rotateReq({ slug: 'cafe-c', status: 'public' }, ADMIN), s)).status, 200);
  const form = new FormData(); form.append('slug', 'cafe-a'); form.append('photo', new Blob([jpegBytes()], { type: 'image/jpeg' }), 'f.jpg');
  const f = await handleAdminPost(new Request('https://www.namax.at/liste', { method: 'POST', headers: { host: 'www.namax.at', cookie: `namax_admin=${ADMIN}` }, body: form }), s);
  assert.equal(f.status, 200);
});

// Review fixes.
test('login cookie is SameSite=Lax, so a link opened from a chat or mail still logs in', async () => {
  const res = await handleAdmin(new Request(`https://www.namax.at/liste?k=${ADMIN}`, { headers: { host: 'www.namax.at' } }), await svc());
  assert.match(res.headers.get('set-cookie'), /; SameSite=Lax;/);
});

test('list POSTs from another origin (a venue subdomain) → 403 and nothing changes', async () => {
  const s = await svc();
  const evil = new Request('https://www.namax.at/liste', { method: 'POST',
    headers: { host: 'www.namax.at', origin: 'https://evil.namax.at', 'content-type': 'text/plain', cookie: `namax_admin=${ADMIN}` }, body: JSON.stringify({ slug: 'cafe-a' }) });
  assert.equal((await handleAdminPost(evil, s)).status, 403);
  assert.equal((await s.store.getVenue('cafe-a')).keyHash, hash(OWNER));
  const same = new Request('https://www.namax.at/liste', { method: 'POST',
    headers: { host: 'www.namax.at', origin: 'https://www.namax.at', 'content-type': 'application/json', cookie: `namax_admin=${ADMIN}` }, body: JSON.stringify({ slug: 'cafe-a', chatOpen: true }) });
  assert.equal((await handleAdminPost(same, s)).status, 200);
});

test('an empty body with a valid cookie → 400, not a crash', async () => {
  const r = await handleAdminPost(new Request('https://www.namax.at/liste', { method: 'POST',
    headers: { host: 'www.namax.at', 'content-type': 'application/json', cookie: `namax_admin=${ADMIN}` }, body: '' }), await svc());
  assert.equal(r.status, 400);
});

test('start page: at most 50 open requests are shown; the count says how many there are', async () => {
  const s = await svc();
  for (let i = 0; i < 53; i++) await s.store.addRequest('cafe-a', { role: 'owner', wish: 'fix', name: 'N' + i, phone: '0660 1234567', channel: 'call', text: '' });
  const html = await chooser(s);
  assert.equal((html.match(/<li class="rq">/g) || []).length, 50);
  assert.match(html, /Anfragen <span>53<\/span>/);
  assert.ok(html.includes('3 ältere Anfragen nicht angezeigt'));
});

test('a request shows the venue name as the page shows it (owner changes included)', async () => {
  const s = await svc();
  await s.store.addRequest('cafe-a', { role: 'owner', wish: 'fix', name: 'N', phone: '0660 1234567', channel: 'call', text: '' });
  const html = await chooser(s);
  assert.ok(html.includes('>Café cafe-a</a>'));
});
