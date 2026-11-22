import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey, newKey, isOwner, viennaDay } from './owner.mjs';
import { ownerPanel } from './owner-ui.mjs';
import { renderPage, slugFromHost } from './page.mjs';
import { renderVenue } from './template.mjs';
import { venuePath } from '../../../middleware.js';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const KEY = 'a'.repeat(32), OTHER = 'b'.repeat(32);

async function setup(status = 'public', extra = {}) {
  const store = memoryStore();
  const f = { ...load('full'), internal: { owner: 'SECRET-OWNER', notes: 'SECRET-NOTE' }, ...extra };
  await store.upsertFacts(f.slug, { facts: f, keyHash: hashKey(KEY), status });
  await store.upsertFacts('minimal', { facts: load('minimal'), keyHash: hashKey(OTHER), status: 'public' });
  return { store, slug: f.slug };
}

test('newKey and hashKey', () => {
  const k = newKey();
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.notEqual(newKey(), k);
  assert.match(hashKey(k), /^[0-9a-f]{64}$/);
  assert.equal(hashKey(k), hashKey(k));
});

test('isOwner: right key only', () => {
  const rec = { keyHash: hashKey(KEY) };
  assert.equal(isOwner(rec, KEY), true);
  assert.equal(isOwner(rec, OTHER), false);
  assert.equal(isOwner(rec, ''), false);
  assert.equal(isOwner(rec, undefined), false);
  assert.equal(isOwner(rec, hashKey(KEY)), false, 'the hash itself is no key');
  assert.equal(isOwner(null, KEY), false);
});

test('unknown slug → 404 with a short body', async () => {
  const { store } = await setup();
  const r = await renderPage({ store, slug: 'gibt-es-nicht', key: '' });
  assert.equal(r.status, 404);
  assert.ok(r.body.length < 2000);
});

test('removed → 410, nothing about the venue, no chat, no phone', async () => {
  const { store, slug } = await setup('removed');
  for (const key of ['', KEY]) {
    const r = await renderPage({ store, slug, key });
    assert.equal(r.status, 410);
    assert.ok(r.body.includes('Seite gelöscht'));
    assert.ok(r.body.includes('https://www.namax.at/impressum'));
    for (const s of ['Friseur Meidling', 'tel:', 'wa.me', 'data-chat', '+43']) assert.ok(!r.body.includes(s), s);
  }
});

test('no key or a wrong key → public page, cached, nothing of the owner', async () => {
  const { store, slug } = await setup();
  for (const key of ['', OTHER, hashKey(KEY), 'x']) {
    const r = await renderPage({ store, slug, key });
    assert.equal(r.status, 200);
    assert.match(r.headers['Cache-Control'], /^public, s-maxage=60$/);
    assert.ok(r.body.includes('Friseur Meidling'));
    for (const s of ['data-chat', 'data-owner', 'wa.me', KEY, hashKey(KEY), 'SECRET-OWNER', 'SECRET-NOTE']) assert.ok(!r.body.includes(s), s);
  }
});

test('the right key → owner page, private, noindex', async () => {
  const { store, slug } = await setup();
  const r = await renderPage({ store, slug, key: KEY });
  assert.equal(r.status, 200);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.equal(r.headers['X-Robots-Tag'], 'noindex');
  assert.ok(r.body.includes('data-owner'));
  assert.ok(!r.body.includes(hashKey(KEY)));
});

test('another venue’s key gives the public page', async () => {
  const { store, slug } = await setup();
  const r = await renderPage({ store, slug, key: OTHER });
  assert.ok(!r.body.includes('data-owner'));
});

test('hidden has noindex, public does not', async () => {
  const h = await setup('hidden');
  assert.match((await renderPage({ store: h.store, slug: h.slug, key: '' })).body, /noindex/);
  const p = await setup('public');
  assert.doesNotMatch((await renderPage({ store: p.store, slug: p.slug, key: '' })).body, /noindex/);
});

test('an owner change with HTML is escaped on the page', async () => {
  const { store, slug } = await setup();
  await store.setPending(slug, { list: { asOf: '2026-11', groups: [{ items: [{ name: '<img src=x onerror=alert(1)>', price: 5 }] }] } });
  await store.applyPending(slug);
  const r = await renderPage({ store, slug, key: '' });
  assert.ok(!r.body.includes('<img src=x'));
  assert.ok(r.body.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('the owner page shows the owner’s changes at once', async () => {
  const { store, slug } = await setup();
  const sat = [null, [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1020]];
  await store.setPending(slug, { hours: sat });
  await store.applyPending(slug);
  assert.ok((await renderPage({ store, slug, key: '' })).body.includes('17:00'));
});

test('renderVenue without an owner part has no owner markup', () => {
  const html = renderVenue(load('full'));
  for (const s of ['data-owner', 'data-chat', 'wa.me', 'has-owner']) assert.ok(!html.includes(s), s);
});

test('slugFromHost and venuePath', () => {
  assert.equal(slugFromHost('friseur-meidling.namax.at'), 'friseur-meidling');
  assert.equal(slugFromHost('Friseur-Meidling.NAMAX.at:443'), 'friseur-meidling');
  assert.equal(slugFromHost('www.namax.at'), null);
  assert.equal(slugFromHost('namax.at'), null);
  assert.equal(slugFromHost('a.b.namax.at'), null);
  assert.equal(slugFromHost('evil.com'), null);
  assert.equal(slugFromHost('friseur-meidling.namax.at.evil.com'), null);
  assert.equal(venuePath('a.namax.at', '/api/venue/chat'), null);
  assert.equal(venuePath('a.namax.at', '/v/_shared/fonts/anton-latin.woff2'), null);
  assert.equal(venuePath('a.namax.at', '/anything'), '/api/venue/page');
  assert.equal(venuePath('a.namax.at', '/'), '/api/venue/page');
  assert.equal(venuePath('www.namax.at', '/'), null);
  assert.equal(venuePath('namax.at', '/api/venue/page'), null);
});

test('owner chat: closed by default → the WhatsApp bar; open → the chat part', async () => {
  const { store, slug } = await setup();
  const ownerPart = async () => ({ css: '', script: '', html: '<section data-ob-test>CHAT</section>' });
  const closed = await renderPage({ store, slug, key: KEY, ownerPart });
  assert.ok(!closed.body.includes('data-ob-test'));
  assert.ok(closed.body.includes('wa.me'));
  await store.setChatOpen(slug, true);
  const open = await renderPage({ store, slug, key: KEY, ownerPart });
  assert.ok(open.body.includes('data-ob-test'));
});

test('owner page: how often the page was opened (today, 7 days, total); visitors never see it', async () => {
  const { store, slug } = await setup();
  const today = viennaDay(new Date());
  await store.addHit(slug, { owner: false, day: today });
  await store.addHit(slug, { owner: false, day: '2020-01-01' });
  await store.addHit(slug, { owner: true, day: today });
  const line = 'Ihre Seite wurde geöffnet: heute 1 · 7 Tage 1 · insgesamt 2';
  const closed = await renderPage({ store, slug, key: KEY });
  assert.ok(closed.body.includes(line));
  assert.ok(closed.body.includes('data-en="Your page was opened: today 1 · 7 days 1 · total 2"'));
  await store.setChatOpen(slug, true);
  const open = await renderPage({ store, slug, key: KEY, ownerPart: ownerPanel });
  assert.ok(open.body.includes(line));
  const pub = await renderPage({ store, slug, key: '' });
  assert.ok(!pub.body.includes('Ihre Seite wurde geöffnet'));
});

test('a stored context puts the street map, the medallion and the neighbours on the public page', async () => {
  const { store, slug } = await setup();
  const before = await renderPage({ store, slug, key: '' });
  assert.ok(!before.body.includes('Rundherum') && !before.body.includes('class="medal"'));
  await store.setContexts([{ slug, context: { near: [{ slug: 'minimal', name: 'Nebenan', kind: 'cafe', m: 50, icon: 'cafe' }], stop: null, facts: ['terrace'], cuisine: [],
    map: { w: 600, h: 340, streets: [], dots: [] } } }]);
  const r = await renderPage({ store, slug, key: '' });
  assert.ok(r.body.includes('Rundherum') && r.body.includes('https://minimal.namax.at/') && r.body.includes('class="medal"') && r.body.includes('Schanigarten'));
});
