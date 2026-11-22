import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey } from './owner.mjs';
import { handleChat, handleClaim, handlePhoto, handleHit, handlePage, handleSitemap, MAX_PHOTO_BYTES, DAILY_PHOTOS, MAX_STORED_PHOTOS } from './http.mjs';

const KEY = 'a'.repeat(32);
const SLUG = 'friseur-meidling';
const facts = JSON.parse(readFileSync(new URL('./fixtures/full.json', import.meta.url)));
async function services(status = 'public', { chatOpen = true } = {}) {
  const store = memoryStore();
  await store.upsertFacts(SLUG, { facts, keyHash: hashKey(KEY), status });
  if (chatOpen) await store.setChatOpen(SLUG, true);
  const uploads = [];
  const deleted = [];
  const blob = { deleted, async put(path, body, opts) { uploads.push({ path, size: body.byteLength ?? body.size, opts }); return { url: `https://abc.public.blob.vercel-storage.com/${path}` }; },
    async del(urls) { deleted.push(...[].concat(urls)); } };
  const llm = { calls: 0, async create() { this.calls++; return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'answer', input: { key: 'who' } }] }; } };
  return { store, blob, llm, uploads };
}
const host = `${SLUG}.namax.at`;
const chatReq = (body, h = host) => new Request(`https://${h}/api/venue/chat`, { method: 'POST', headers: { host: h, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const jpeg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(Math.max(0, n - 4)).fill(1)]);
const photoReq = (bytes, { key = KEY, type = 'image/jpeg', h = host } = {}) => {
  const fd = new FormData();
  fd.set('k', key);
  fd.set('photo', new Blob([bytes], { type }), 'x.jpg');
  return new Request(`https://${h}/api/venue/photo`, { method: 'POST', headers: { host: h }, body: fd });
};

test('chat without the right key → 403 and nothing stored', async () => {
  const s = await services();
  for (const k of [undefined, 'b'.repeat(32), 'local', '']) {
    const r = await handleChat(chatReq({ k, input: { start: true } }), s);
    assert.equal(r.status, 403);
  }
  assert.equal((await s.store.listMessages(SLUG, 10)).length, 0);
});

test('chat reads the slug from the host, never from the body', async () => {
  const s = await services();
  const r = await handleChat(chatReq({ k: KEY, slug: 'other', input: { start: true } }, 'unknown.namax.at'), s);
  assert.equal(r.status, 404);
});

test('chat with the key answers with phrases and chips, no-store', async () => {
  const s = await services();
  const r = await handleChat(chatReq({ k: KEY, input: { start: true } }), s);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  const j = await r.json();
  assert.ok(j.say.length && j.chips.length);
  assert.equal(j.keyHash, undefined);
});

test('chat refuses a body that is not JSON or too large', async () => {
  const s = await services();
  const bad = new Request(`https://${host}/api/venue/chat`, { method: 'POST', headers: { host }, body: 'x'.repeat(20000) });
  assert.equal((await handleChat(bad, s)).status, 400);
  assert.equal((await handleChat(new Request(`https://${host}/api/venue/chat`, { method: 'GET', headers: { host } }), s)).status, 405);
});

test('a client cannot inject a model result', async () => {
  const s = await services();
  await handleChat(chatReq({ k: KEY, input: { start: true } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'lang_de' } }), s);
  await handleChat(chatReq({ k: KEY, input: { model: { type: 'removal' } } }), s);
  assert.equal((await s.store.getVenue(SLUG)).status, 'public');
});

test('photo: key, type, size and daily count are checked; path is random under the venue', async () => {
  const s = await services();
  assert.equal((await handlePhoto(photoReq(jpeg(100), { key: 'b'.repeat(32) }), s)).status, 403);
  assert.equal((await handlePhoto(photoReq(jpeg(100), { type: 'image/svg+xml' }), s)).status, 415);
  assert.equal((await handlePhoto(photoReq(new Uint8Array([60, 115, 118, 103, 1, 1]), { type: 'image/jpeg' }), s)).status, 415, 'bytes must really be an image');
  assert.equal((await handlePhoto(photoReq(jpeg(MAX_PHOTO_BYTES + 1)), s)).status, 413);
  const ok = await handlePhoto(photoReq(jpeg(1000)), s);
  assert.equal(ok.status, 200);
  const { id } = await ok.json();
  assert.ok(id);
  assert.match(s.uploads[0].path, /^venues\/friseur-meidling\/[0-9a-f]{32}\.jpg$/);
  assert.equal((await s.store.listPhotos(SLUG))[0].kind, 'priceboard', 'uploaded photos stay off the page until the chat shows them');
  for (let i = 1; i < DAILY_PHOTOS; i++) assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 200);
  assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 429);
});

test('photo for a removed venue → 410', async () => {
  const s = await services('removed');
  assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 410);
});

test('hit always answers 204 and counts owner and visitor apart', async () => {
  const s = await services();
  const hit = (body) => handleHit(new Request(`https://${host}/api/venue/hit`, { method: 'POST', headers: { host }, body: JSON.stringify(body) }), s);
  assert.equal((await hit({})).status, 204);
  assert.equal((await hit({ k: KEY })).status, 204);
  assert.equal((await hit({ k: 'nonsense' })).status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 2, owner: 1 });
  const bot = await handleHit(new Request(`https://${host}/api/venue/hit`, { method: 'POST',
    headers: { host, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }, body: '{}' }), s);
  assert.equal(bot.status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 2, owner: 1 }, 'crawlers are not counted');
  const unknown = await handleHit(new Request('https://nope.namax.at/api/venue/hit', { method: 'POST', headers: { host: 'nope.namax.at' }, body: '{}' }), s);
  assert.equal(unknown.status, 204);
});

test('page handler: key from ?k, owner page private, public page cached', async () => {
  const s = await services();
  const pub = await handlePage(new Request(`https://${host}/`, { headers: { host } }), s);
  assert.equal(pub.status, 200);
  assert.match(pub.headers.get('cache-control'), /public/);
  const own = await handlePage(new Request(`https://${host}/?k=${KEY}`, { headers: { host } }), s);
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
  assert.ok(!(await pub.text()).includes(KEY));
});

test('venue host: /favicon.svg is the venue medallion in its sign colours; the page links it; unknown hosts 404', async () => {
  const s = await services();
  const get = (path, h = host) => handlePage(new Request(`https://${h}${path}`, { headers: { host: h } }), s);
  const r = await get('/favicon.svg');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  const svg = await r.text();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#[0-9a-f]{6}"\/>/);
  assert.match(svg, /<path fill="#[0-9a-f]{6}" fill-rule="evenodd" d="M/);
  assert.equal((await get('/favicon.svg', 'nobody-here.namax.at')).status, 404);
  assert.match(await (await get('/')).text(), /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
});

test('venue host: robots.txt per status, other paths 404, only "/" renders the page', async () => {
  const s = await services();
  const get = (path, st = s) => handlePage(new Request(`https://${host}${path}`, { headers: { host } }), st);
  const robots = await get('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(await robots.text(), /Allow: \/[\s\S]*Sitemap: https:\/\/www\.namax\.at\/api\/venue\/sitemap/);
  assert.equal((await get('/favicon.ico')).status, 404);
  assert.equal((await get('/wp-login.php')).status, 404);
  const hidden = await services('hidden');
  assert.match(await (await get('/robots.txt', hidden)).text(), /Disallow: \//);
});

test('sitemap lists public venues only', async () => {
  const s = await services();
  await s.store.upsertFacts('hidden-one', { facts: { ...facts, slug: 'hidden-one' }, keyHash: 'x', status: 'hidden' });
  const r = await handleSitemap(new Request('https://www.namax.at/api/venue/sitemap'), s);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /xml/);
  const xml = await r.text();
  assert.ok(xml.includes('<loc>https://friseur-meidling.namax.at/</loc>'));
  assert.ok(!xml.includes('hidden-one'));
});

test('R4: public page has no stale-while-revalidate; the rewritten path also renders the page', async () => {
  const s = await services();
  const pub = await handlePage(new Request(`https://${host}/`, { headers: { host } }), s);
  assert.doesNotMatch(pub.headers.get('cache-control'), /stale/);
  const rewritten = await handlePage(new Request(`https://${host}/api/venue/page`, { headers: { host } }), s);
  assert.equal(rewritten.status, 200);
});

test('photo: at most 4 are kept; the 5th replaces the oldest and its file is deleted', async () => {
  const s = await services();
  assert.equal(MAX_STORED_PHOTOS, 4);
  for (let i = 0; i < 5; i++) assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 200);
  const kept = await s.store.listPhotos(SLUG);
  assert.equal(kept.length, 4);
  const first = 'https://abc.public.blob.vercel-storage.com/' + s.uploads[0].path;
  assert.deepEqual(s.blob.deleted, [first]);
  assert.ok(!kept.some((p) => p.url === first));
});

test('daily upload limit still holds when old photos are replaced', async () => {
  const s = await services();
  for (let i = 0; i < DAILY_PHOTOS; i++) assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 200);
  assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 429);
});

test('removing the page deletes all its photos and their files', async () => {
  const s = await services();
  for (let i = 0; i < 3; i++) await handlePhoto(photoReq(jpeg(1000)), s);
  await handleChat(chatReq({ k: KEY, input: { start: true } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'lang_de' } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'delete' } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'delete_yes' } }), s);
  assert.equal((await s.store.getVenue(SLUG)).status, 'removed');
  assert.equal((await s.store.listPhotos(SLUG)).length, 0);
  assert.equal(s.blob.deleted.length, 3);
});

test('removing the page deletes its facade photo too', async () => {
  const s = await services();
  await s.store.setFacade(SLUG, 'https://abc.public.blob.vercel-storage.com/venues/x/facade-1.jpg');
  await handleChat(chatReq({ k: KEY, input: { start: true } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'lang_de' } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'delete' } }), s);
  await handleChat(chatReq({ k: KEY, input: { chip: 'delete_yes' } }), s);
  assert.equal((await s.store.getVenue(SLUG)).facadeUrl, null);
  assert.ok(s.blob.deleted.includes('https://abc.public.blob.vercel-storage.com/venues/x/facade-1.jpg'));
});

const claimReq = (body, h = host) => new Request(`https://${h}/api/venue/claim`, { method: 'POST', headers: { host: h, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const claim = { role: 'owner', wish: 'website', name: 'Ali', phone: '+43 660 1234567', channel: 'whatsapp', text: 'Bitte melden' };

test('claim: stores a request with role, wish and channel; the venue comes from the host', async () => {
  const s = await services();
  const r = await handleClaim(claimReq({ ...claim, slug: 'other-venue' }), s);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  const [q] = await s.store.listRequests();
  assert.equal(q.slug, SLUG); assert.equal(q.role, 'owner'); assert.equal(q.wish, 'website');
  assert.equal(q.channel, 'whatsapp'); assert.equal(q.phone, '+43 660 1234567'); assert.equal(q.name, 'Ali'); assert.equal(q.text, 'Bitte melden');
});

test('claim: honeypot filled → 200 and nothing stored', async () => {
  const s = await services();
  const r = await handleClaim(claimReq({ ...claim, website: 'http://spam' }), s);
  assert.equal(r.status, 200);
  assert.deepEqual(await s.store.listRequests(), []);
});

test('claim: bad phone, role, wish, channel or lengths → 400', async () => {
  const s = await services();
  for (const bad of [{ phone: 'call me' }, { phone: '12345' }, { phone: '+43 660 123456789012345678' }, { phone: '' },
    { role: 'boss' }, { wish: 'money' }, { channel: 'mail' }, { name: 'x'.repeat(81) }, { text: 'x'.repeat(501) }]) {
    assert.equal((await handleClaim(claimReq({ ...claim, ...bad }), s)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await handleClaim(new Request(`https://${host}/api/venue/claim`, { method: 'POST', headers: { host }, body: 'nope' }), s)).status, 400);
  assert.deepEqual(await s.store.listRequests(), []);
});

test('claim: without a name or message is fine', async () => {
  const s = await services();
  assert.equal((await handleClaim(claimReq({ role: 'staff', wish: 'fix', phone: '01 234 5678', channel: 'call' }), s)).status, 200);
});

test('claim: 4th request for a venue in a Vienna day → 429', async () => {
  const s = await services();
  for (let i = 0; i < 3; i++) assert.equal((await handleClaim(claimReq(claim), s)).status, 200);
  assert.equal((await handleClaim(claimReq(claim), s)).status, 429);
  assert.equal((await s.store.listRequests()).length, 3);
});

test('claim: one sender gets at most 5 requests a day across venues; 200 a day in total', async () => {
  const s = await services();
  for (const n of ['b', 'c']) await s.store.upsertFacts(`v-${n}`, { facts: { ...facts, slug: `v-${n}` }, keyHash: 'h', status: 'public' });
  const from = (ip, h = host) => new Request(`https://${h}/api/venue/claim`, { method: 'POST',
    headers: { host: h, 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: JSON.stringify(claim) });
  const codes = [];
  for (const h of [host, host, host, 'v-b.namax.at', 'v-b.namax.at', 'v-b.namax.at']) codes.push((await handleClaim(from('1.2.3.4', h), s)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await handleClaim(from('5.6.7.8', 'v-c.namax.at'), s)).status, 200, 'another sender still gets through');
  assert.ok(!JSON.stringify(await s.store.listRequests()).includes('1.2.3.4'), 'the address itself is never stored');
  const busy = { ...s, store: { ...s.store, getVenue: s.store.getVenue, countRequestsSince: async () => 0, countRequestsByIpSince: async () => 0, countAllRequestsSince: async () => 200 } };
  assert.equal((await handleClaim(from('9.9.9.9', 'v-c.namax.at'), busy)).status, 429);
});

test('claim: unknown or removed venue → 404; GET → 405', async () => {
  const s = await services();
  assert.equal((await handleClaim(claimReq(claim, 'nope.namax.at'), s)).status, 404);
  await s.store.setStatus(SLUG, 'removed');
  assert.equal((await handleClaim(claimReq(claim), s)).status, 404);
  assert.equal((await handleClaim(new Request(`https://${host}/api/venue/claim`, { headers: { host } }), s)).status, 405);
});

test('chat and photo upload → 404 while Nasim has not opened the chat for the venue', async () => {
  const s = await services('public', { chatOpen: false });
  assert.equal((await handleChat(chatReq({ k: KEY, input: { start: true } }), s)).status, 404);
  assert.equal((await handlePhoto(photoReq(jpeg(1000)), s)).status, 404);
  assert.equal(s.uploads.length, 0);
  assert.equal(s.llm.calls, 0);
  assert.equal((await s.store.listMessages(SLUG, 10)).length, 0);
});

test('claim: a visitor report needs only what is wrong; the number is optional', async () => {
  const s = await services();
  const report = { role: 'other', wish: 'fix', text: 'Montag ist geschlossen' };
  assert.equal((await handleClaim(claimReq(report), s)).status, 200);
  const [q] = await s.store.listRequests();
  assert.equal(q.channel, 'none'); assert.equal(q.phone, ''); assert.equal(q.text, 'Montag ist geschlossen');
  assert.equal((await handleClaim(claimReq({ ...report, phone: '+43 660 1234567' }), s)).status, 200);
  for (const bad of [{ text: '' }, { text: 'x' }, { phone: '123' }]) {
    assert.equal((await handleClaim(claimReq({ ...report, ...bad }), s)).status, 400, JSON.stringify(bad));
  }
  // an owner still has to leave a number
  assert.equal((await handleClaim(claimReq({ ...claim, phone: '', channel: '' }), s)).status, 400);
});
