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

const lokale = (k, extra = '') => new Request(`https://www.namax.at/liste?v=lokale${extra}`, { headers: { host: 'www.namax.at', cookie: `namax_admin=${k}` } });

test('"Lokale" tab without a district: a chooser with every district and its count, no cards, no key in the page', async () => {
  const s = await twoDistricts();
  for (const r of [lokale(ADMIN), req(ADMIN, '99'), req(ADMIN, 'x')]) {
    const res = await handleAdmin(r, s);
    const d = r.url;
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

test('start page: "Anfragen" with the open count, website wishes first, escaped, done ones folded', async () => {
  const html = await chooser(await reqSvc());
  assert.ok(!html.includes('data-pick="'), 'districts live in the "Lokale" tab');
  assert.match(html, /Anfragen <span>2<\/span>/);
  assert.ok(html.indexOf('>Mo<') < html.indexOf('Ali &lt;i&gt;'), 'own-website wish first');
  assert.ok(html.includes('Familie / Mitarbeiter · Angaben korrigieren · Anruf'));
  assert.ok(html.includes('Inhaber/in · Eigene Website · WhatsApp'));
  assert.ok(html.includes('Website!'));
  assert.ok(html.includes('Ali &lt;i&gt;') && html.includes('Zeiten &lt;script&gt;'));
  assert.ok(!html.includes('Zeiten <script>'));
  assert.match(html, /<details[^>]*><summary>Erledigt \(1\)<\/summary>[\s\S]*Seite entfernen/);
  assert.ok(html.includes('href="https://cafe-a.namax.at/"'));
});

test('request card: the main button answers the way the owner chose, on the number they typed', async () => {
  const html = await chooser(await reqSvc());
  assert.ok(html.includes('href="tel:+436601234567"'));
  assert.ok(html.includes('href="https://wa.me/436647654321?text='), 'Austrian 0664… becomes 43664…');
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

// Two tabs: "Anfragen" is always the start page, "Lokale" holds districts and cards.
const tabs = (html) => (html.match(/<nav class="tabs"[\s\S]*?<\/nav>/) || [''])[0];

test('start page without any request: the "Anfragen" tab, an empty note, no jump to a district', async () => {
  const html = await chooser(await svc());
  assert.match(tabs(html), /<a href="\/liste" aria-current="page">Anfragen <span>0<\/span><\/a>/);
  assert.match(tabs(html), /<a href="\/liste\?v=lokale" data-lokale>Lokale<\/a>/);
  assert.ok(html.includes('Noch keine Anfragen'));
  assert.ok(!html.includes('data-pick="'));
  assert.ok(!/return go\(/.test(html), 'the start page never jumps away');
});

test('"Lokale" tab is marked on the district chooser and on the cards; every page shows the open count', async () => {
  const s = await reqSvc();
  const ch = await (await handleAdmin(lokale(ADMIN), s)).text();
  assert.match(tabs(ch), /<a href="\/liste\?v=lokale" data-lokale aria-current="page">Lokale<\/a>/);
  assert.match(tabs(ch), /Anfragen <span>2<\/span>/);
  const cardsPage = await (await handleAdmin(req(ADMIN, '12'), s)).text();
  assert.match(tabs(cardsPage), /aria-current="page">Lokale</);
  assert.match(tabs(cardsPage), /<a href="\/liste">Anfragen <span>2<\/span><\/a>/);
  assert.ok(!cardsPage.includes(ADMIN) && !ch.includes(ADMIN));
});

test('the "Lokale" tab link reopens the last district used (stored in the browser only)', () => {
  const html = renderAdmin([], { districts: [{ d: 12, n: 2 }], chooser: true });
  assert.ok(html.includes("namax-liste-d"));
  assert.ok(html.includes('data-lokale'));
});

// Visit counter: how often the venue pages were opened (owner views excluded), in Vienna days.
async function visSvc() {
  const s = await twoDistricts();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const slugs = (await s.store.listForAdmin()).map((r) => r.slug).sort();
  for (let i = 0; i < 3; i++) await s.store.addHit(slugs[0], { owner: false, day: today });
  await s.store.addHit(slugs[0], { owner: false, day: '2020-01-01' });
  await s.store.addHit(slugs[1], { owner: false, day: today });
  await s.store.addHit(slugs[1], { owner: true, day: today });
  return { s, slugs };
}

test('visits: every admin page shows today / 7 days / total over all pages', async () => {
  const { s } = await visSvc();
  for (const r of [req(ADMIN, ''), lokale(ADMIN), req(ADMIN, '12')]) {
    const html = await (await handleAdmin(r, s)).text();
    assert.match(html, /<p class="vis">Besuche · heute <b>4<\/b> · 7 Tage <b>4<\/b> · gesamt <b>5<\/b><\/p>/, r.url);
  }
});

test('visits: the Lokale tab lists the most visited pages of the last 7 days', async () => {
  const { s, slugs } = await visSvc();
  const html = await (await handleAdmin(lokale(ADMIN), s)).text();
  const top = (html.match(/<ol class="top">[\s\S]*?<\/ol>/) || [''])[0];
  assert.ok(top.indexOf(`https://${slugs[0]}.namax.at/`) >= 0 && top.indexOf(`https://${slugs[0]}.namax.at/`) < top.indexOf(`https://${slugs[1]}.namax.at/`));
  assert.ok(top.includes('<span>3</span>'));
});

test('visits: each card shows its own numbers; a page without visits shows none', async () => {
  const { s } = await visSvc();
  const html = await (await handleAdmin(req(ADMIN, 'all'), s)).text();
  assert.equal((html.match(/class="seen"/g) || []).length, 2);
  assert.ok(html.includes('<small class="seen">Besuche: heute 3 · 7 Tage 3 · gesamt 4</small>'));
});

// More than one city: "Lokale" first asks for the city (Wien first), then its districts; ?d= alone stays Vienna.
async function twoCities() {
  const s = await twoDistricts();
  const graz = (slug, d, area, extra = {}) => facts(slug, { name: 'Graz ' + slug, area, address: { street: 'Lendplatz 1', zip: '8020', city: 'Graz' },
    internal: { city: 'graz', district: d }, ...extra });
  await s.store.upsertFacts('lend-cafe', { facts: graz('lend-cafe', 4, 'Lend'), keyHash: 'h', status: 'public' });
  await s.store.upsertFacts('andritz-cafe', { facts: graz('andritz-cafe', 12, 'Andritz'), keyHash: 'h', status: 'public' });
  await s.store.upsertFacts('andritz-two', { facts: graz('andritz-two', 12, 'Andritz'), keyHash: 'h', status: 'public' });
  return s;
}
const cityNav = (html) => (html.match(/<nav class="cities"[\s\S]*?<\/nav>/) || [''])[0];

test('cities: the "Lokale" chooser offers every city with its count, Wien first and chosen by default', async () => {
  const html = await (await handleAdmin(lokale(ADMIN), await twoCities())).text();
  const nav = cityNav(html);
  assert.match(nav, /<a href="\/liste\?v=lokale" aria-current="page">Wien <span>3<\/span><\/a>/);
  assert.match(nav, /<a href="\/liste\?v=lokale&amp;c=graz">Graz <span>3<\/span><\/a>/);
  assert.ok(nav.indexOf('Wien') < nav.indexOf('Graz'));
  assert.match(html, /data-pick="12"[^>]*>12\. Meidling <span>2<\/span>/, 'Vienna districts, Graz records not counted in them');
  assert.ok(!html.includes('Andritz'));
});

test('cities: Graz districts in Roman numerals with their names; ?c=graz&d= shows only that Graz district', async () => {
  const s = await twoCities();
  const ch = await (await handleAdmin(lokale(ADMIN, '&c=graz'), s)).text();
  assert.match(cityNav(ch), /c=graz" aria-current="page">Graz/);
  assert.match(ch, /data-pick="4"[^>]*>IV\. Lend <span>1<\/span>/);
  assert.match(ch, /data-pick="12"[^>]*>XII\. Andritz <span>2<\/span>/);
  assert.match(ch, /data-pick="all"[^>]*>Alle Bezirke <span>3<\/span>/);
  assert.ok(!ch.includes('Meidling'));
  const g12 = await (await handleAdmin(new Request('https://www.namax.at/liste?c=graz&d=12', { headers: { host: 'www.namax.at', cookie: `namax_admin=${ADMIN}` } }), s)).text();
  assert.equal(cards(g12), 2);
  assert.ok(g12.includes('Graz andritz-cafe') && !g12.includes('Café cafe-a'));
  assert.match(g12, /XII\. Andritz/);
  assert.match(g12, /<option value="12" selected>XII\. Andritz \(2\)<\/option>/);
  const gAll = await (await handleAdmin(new Request('https://www.namax.at/liste?c=graz&d=all', { headers: { host: 'www.namax.at', cookie: `namax_admin=${ADMIN}` } }), s)).text();
  assert.equal(cards(gAll), 3, '"all" means all of Graz');
});

test('cities: ?d=12 without a city is still Vienna\'s 12th district, old bookmarks keep working', async () => {
  const html = await (await handleAdmin(req(ADMIN, '12'), await twoCities())).text();
  assert.equal(cards(html), 2);
  assert.ok(!html.includes('Graz andritz'));
  assert.match(html, /12\. Meidling/);
  assert.equal(cards(await (await handleAdmin(req(ADMIN, 'all'), await twoCities())).text()), 3, '"all" without a city is all of Vienna');
});

test('cities: an unknown city falls back to Wien; with one city only there is no city row', async () => {
  const html = await (await handleAdmin(lokale(ADMIN, '&c=atlantis'), await twoCities())).text();
  assert.match(cityNav(html), /href="\/liste\?v=lokale" aria-current="page">Wien/);
  const one = await (await handleAdmin(lokale(ADMIN), await twoDistricts())).text();
  assert.equal(cityNav(one), '');
});

test('a request for a venue we do not list shows its name and "Neues Lokal", no page link, escaped', async () => {
  const s = await svc();
  await s.store.addRequest(null, { role: 'owner', wish: 'photos', name: 'Sara', phone: '+43 660 1234567', channel: 'call', lokal: 'Neu <b>Café</b>, 1160' });
  const html = await chooser(s);
  assert.match(html, /Neu &lt;b&gt;Café&lt;\/b&gt;, 1160<\/b><span class="b">Neues Lokal<\/span>/);
  assert.ok(!html.includes('https://null.namax.at'));
});

test('request card: WhatsApp opens with a greeting by name and venue; without a name just "Hallo,"', async () => {
  const s = await svc();
  await s.store.addRequest('cafe-a', { role: 'owner', wish: 'fix', name: 'Dani', phone: '0664 765 43 21', channel: 'whatsapp', text: '' });
  await s.store.addRequest(null, { role: 'owner', wish: 'photos', name: '', phone: '0660 1234567', channel: 'call', lokal: 'Neu & Co, Gasse 2, 1160 Wien' });
  const html = await chooser(s);
  const hi = encodeURIComponent('Hallo Dani, hier ist Nasim von namax. Danke für Ihre Anfrage zu Café cafe-a.');
  assert.ok(html.includes(`href="https://wa.me/436647654321?text=${hi}"`));
  const anon = encodeURIComponent('Hallo, hier ist Nasim von namax. Danke für Ihre Anfrage zu Neu & Co.');
  assert.ok(html.includes(`https://wa.me/436601234567?text=${anon}`), 'a call request also gets a WhatsApp link with the greeting');
  assert.ok(html.includes('href="tel:+436601234567"'));
});

test('request card: "Chat + Link senden" only where the page has an owner link; the message carries that link', async () => {
  const s = await svc();
  await s.store.addRequest('cafe-a', { role: 'owner', wish: 'fix', name: 'Dani', phone: '0664 765 43 21', channel: 'whatsapp', text: '' });
  await s.store.addRequest('friseur-b', { role: 'owner', wish: 'fix', name: 'Mo', phone: '0664 111 22 33', channel: 'whatsapp', text: '' });
  await s.store.addRequest(null, { role: 'owner', wish: 'photos', name: 'Sara', phone: '0660 1234567', channel: 'whatsapp', lokal: 'Neu' });
  const html = await chooser(s);
  assert.equal((html.match(/data-send="/g) || []).length, 1, 'friseur-b has no sealed key, the new venue no page');
  const msg = encodeURIComponent('Hallo Dani, hier ist Nasim von namax. Danke für Ihre Anfrage zu Café cafe-a.\n\n'
    + `Mit diesem Link ändern Sie Öffnungszeiten, Telefon und Fotos selbst: https://cafe-a.namax.at/?k=${OWNER}`);
  assert.ok(html.includes(`data-send="cafe-a" data-wa="https://wa.me/436647654321?text=${msg}"`));
  assert.ok(html.includes('Chat + Link senden'));
});

test('request card: "Nummer passt zur Seite" only when the typed number is the page phone', async () => {
  const store = memoryStore();
  await store.upsertFacts('cafe-p', { facts: facts('cafe-p', { phone: '+43 1 234 56 78' }), keyHash: 'h', status: 'public' });
  await store.addRequest('cafe-p', { role: 'owner', wish: 'fix', name: 'A', phone: '01 2345678', channel: 'call', text: '' });
  const s = { store, adminKeyHash: hash(ADMIN) };
  assert.ok((await chooser(s)).includes('Nummer passt zur Seite ✓'));
  await store.addRequest('cafe-p', { role: 'owner', wish: 'fix', name: 'B', phone: '0660 9999999', channel: 'call', text: '' });
  assert.equal(((await chooser(s)).match(/Nummer passt zur Seite/g) || []).length, 1);
});
