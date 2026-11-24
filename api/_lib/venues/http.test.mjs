import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey } from './owner.mjs';
import { handleContact, handleChat, handleClaim, handleSearch, handleSignup, handlePhoto, handleHit, handlePage, handleSitemap, MAX_PHOTO_BYTES, DAILY_PHOTOS, MAX_STORED_PHOTOS } from './http.mjs';

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
  assert.equal((await hit({ src: 'google' })).status, 204);
  assert.equal((await hit({ k: KEY })).status, 204);
  assert.equal((await hit({ k: 'nonsense', src: 'direct' })).status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 2, owner: 1 });
  // the old beacon on page load sent no source: not a counted visit
  assert.equal((await hit({})).status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 2, owner: 1 });
  const bot = await handleHit(new Request(`https://${host}/api/venue/hit`, { method: 'POST',
    headers: { host, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }, body: '{}' }), s);
  assert.equal(bot.status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 2, owner: 1 }, 'crawlers are not counted');
  const unknown = await handleHit(new Request('https://nope.namax.at/api/venue/hit', { method: 'POST', headers: { host: 'nope.namax.at' }, body: '{}' }), s);
  assert.equal(unknown.status, 204);
});

test('hit: Nasim\'s marked device is not counted; an unknown source becomes "other"', async () => {
  const s = await services();
  const hit = (body, headers = {}) => handleHit(new Request(`https://${host}/api/venue/hit`, { method: 'POST', headers: { host, ...headers }, body: JSON.stringify(body) }), s);
  assert.equal((await hit({ src: 'google' }, { cookie: 'a=b; nx_staff=1' })).status, 204);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 0, owner: 0 });
  await hit({ src: '<script>' });
  await hit({ src: 'google' });
  const w = { today: '2000-01-01', weekStart: '0000-01-01' };
  assert.deepEqual(await s.store.hitSources(w), { other: 1, google: 1 });
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
  const rb = await (await get('/robots.txt')).text();
  assert.match(rb, /User-agent: GPTBot\n[\s\S]*User-agent: Bytespider\n[\s\S]*?Disallow: \/\n\nUser-agent: \*\nAllow: \//, 'training and SEO crawlers are turned away, everyone else may crawl');
  assert.doesNotMatch(rb, /PerplexityBot|OAI-SearchBot|Googlebot/, 'search crawlers stay allowed');
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

// ── namax.at/kostenlos: search for one's venue, then a request from the main site ──
const wwwReq = (path, body) => new Request(`https://www.namax.at${path}`, body === undefined
  ? { headers: { host: 'www.namax.at' } }
  : { method: 'POST', headers: { host: 'www.namax.at', 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify(body) });
async function directory() {
  const s = await services();
  const add = (slug, name, status = 'public', street = 'Hauptstraße 1', zip = '1050') =>
    s.store.upsertFacts(slug, { facts: { ...facts, name, address: { street, zip, city: 'Wien' } }, keyHash: hashKey(KEY), status });
  await add('cafe-dani', 'Café Dani');
  await add('dani-kebab', 'Kebab bei Dani', 'public', 'Gasse 2', '1100');
  await add('danube-bar', 'Danube Bar');
  await add('dani-hidden', 'Dani Versteckt', 'hidden');
  return s;
}

test('search finds public venues by name, accents ignored, best match first, hidden ones never', async () => {
  const s = await directory();
  const r = await handleSearch(wwwReq('/api/venue/search?q=cafe%20dan'), s);
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.deepEqual(results.map((x) => x.slug), ['cafe-dani']);
  assert.equal(results[0].name, 'Café Dani');
  assert.match(results[0].place, /Hauptstraße 1, 1050 Wien/);
  const all = (await (await handleSearch(wwwReq('/api/venue/search?q=dani'), s)).json()).results.map((x) => x.slug);
  assert.ok(all.includes('cafe-dani') && all.includes('dani-kebab'));
  assert.ok(!all.includes('dani-hidden'));
  assert.deepEqual(all, ['cafe-dani', 'dani-kebab']); // both have a word starting with "dani": alphabetical
  const dan = (await (await handleSearch(wwwReq('/api/venue/search?q=dan'), s)).json()).results.map((x) => x.slug);
  assert.equal(dan[0], 'danube-bar'); // the name itself starts with the query
});

test('search: short or long queries give nothing, at most 8 results', async () => {
  const s = await directory();
  for (let i = 0; i < 12; i++) await s.store.upsertFacts(`pizza-${i}`, { facts: { ...facts, name: `Pizza ${i}` }, keyHash: hashKey(KEY), status: 'public' });
  assert.deepEqual((await (await handleSearch(wwwReq('/api/venue/search?q=d'), s)).json()).results, []);
  assert.deepEqual((await (await handleSearch(wwwReq('/api/venue/search?q=' + 'x'.repeat(80)), s)).json()).results, []);
  assert.equal((await (await handleSearch(wwwReq('/api/venue/search?q=pizza'), s)).json()).results.length, 8);
});

const signup = { slug: 'cafe-dani', role: 'owner', wish: 'manage', name: 'Dani', phone: '+43 660 1234567', channel: 'call' };
test('signup for a found venue lands in the requests of that venue', async () => {
  const s = await directory();
  const r = await handleSignup(wwwReq('/api/venue/signup', signup), s);
  assert.equal(r.status, 200);
  const [q] = await s.store.listRequests();
  assert.equal(q.slug, 'cafe-dani'); assert.equal(q.wish, 'manage'); assert.equal(q.lokal, '');
});

test('signup for a venue we do not list keeps its name and address, without a page', async () => {
  const s = await directory();
  const r = await handleSignup(wwwReq('/api/venue/signup', { ...signup, slug: undefined, lokal: 'Neues Café, Gasse 5, 1160 Wien' }), s);
  assert.equal(r.status, 200);
  const [q] = await s.store.listRequests();
  assert.equal(q.slug, null); assert.equal(q.lokal, 'Neues Café, Gasse 5, 1160 Wien');
});

test('signup refuses hidden venues, visitors, missing number or missing venue', async () => {
  const s = await directory();
  for (const bad of [{ slug: 'dani-hidden' }, { slug: 'nope' }, { role: 'other' }, { wish: 'remove' }, { phone: '' }, { channel: 'none' },
    { slug: undefined }, { slug: undefined, lokal: 'ab' }, { slug: undefined, lokal: 'x'.repeat(200) }]) {
    assert.notEqual((await handleSignup(wwwReq('/api/venue/signup', { ...signup, ...bad }), s)).status, 200, JSON.stringify(bad));
  }
  assert.equal((await s.store.listRequests()).length, 0);
  const trap = await handleSignup(wwwReq('/api/venue/signup', { ...signup, website: 'http://spam' }), s);
  assert.equal(trap.status, 200);
  assert.equal((await s.store.listRequests()).length, 0);
});

test('signup: one sender cannot flood', async () => {
  const s = await directory();
  let last;
  for (let i = 0; i < 7; i++) last = await handleSignup(wwwReq('/api/venue/signup', { ...signup, slug: undefined, lokal: `Lokal Nummer ${i}` }), s);
  assert.equal(last.status, 429);
});

test('owner form events: only the known words are counted, per venue and day; "sent" only by the server', async () => {
  const s = await services();
  const hit = (body, headers = {}) => handleHit(new Request(`https://${host}/api/venue/hit`, { method: 'POST', headers: { host, ...headers }, body: JSON.stringify(body) }), s);
  for (const ev of ['open:niche', 'role:owner', 'wish:photos', 'step:3', 'close:3', 'fail', 'sent', 'name:Ali', '+43 660 1', 42])
    assert.equal((await hit({ ev })).status, 204);
  await hit({ ev: 'open:link' }, { cookie: 'nx_staff=1' });
  await hit({ ev: 'open:link' }, { 'user-agent': 'Googlebot' });
  const rows = (await s.store.claimEventRows({ since: '2000-01-01' })).map((r) => r.event).sort();
  assert.deepEqual(rows, ['close:3', 'fail', 'open:niche', 'role:owner', 'step:3', 'wish:photos']);
  assert.deepEqual(await s.store.getHits(SLUG), { visitors: 0, owner: 0 }, 'a form event is not a page view');
  assert.equal((await handleClaim(claimReq(claim), s)).status, 200);
  assert.equal((await handleClaim(claimReq({ ...claim, website: 'spam' }), s)).status, 200);
  const sent = (await s.store.claimEventRows({ since: '2000-01-01' })).filter((r) => r.event === 'sent');
  assert.equal(sent.length, 1); assert.equal(sent[0].n, 1, 'the honeypot is not counted');
});

const contactReq = (body, headers = {}) => new Request('https://www.namax.at/api/venue/contact',
  { method: 'POST', headers: { host: 'www.namax.at', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const contact = { page: 'seo', role: 'nosite', wish: 'seo', name: 'Ali', phone: '+43 660 1234567', channel: 'call', text: 'Bitte anrufen' };

test('site contact form: a request without a venue, with its own roles and wishes; "sent" counted per page', async () => {
  const s = await services();
  const r = await handleContact(contactReq(contact), s);
  assert.equal(r.status, 200);
  const [q] = await s.store.listRequests();
  assert.equal(q.slug, null); assert.equal(q.role, 'nosite'); assert.equal(q.wish, 'seo'); assert.equal(q.channel, 'call');
  assert.equal(q.phone, '+43 660 1234567'); assert.equal(q.name, 'Ali'); assert.equal(q.text, 'Bitte anrufen');
  assert.deepEqual((await s.store.siteEventRows({ since: '2000-01-01' })).map((e) => [e.page, e.event, e.n]), [['seo', 'sent', 1]]);
  for (const bad of [{ role: 'owner' }, { wish: 'remove' }, { channel: 'fax' }, { phone: '12' }, { text: 'x'.repeat(501) }])
    assert.equal((await handleContact(contactReq({ ...contact, ...bad }), s)).status, 400, JSON.stringify(bad));
  assert.equal((await handleContact(contactReq({ ...contact, website: 'spam' }), s)).status, 200);
  assert.equal((await s.store.listRequests()).length, 1, 'the honeypot is not stored');
});

test('contact form of the other sites: the project comes from the Origin, with CORS for that site only', async () => {
  const s = await services();
  const ak = { origin: 'https://lokale.akiwi.at' };
  const pre = await handleContact(new Request('https://www.namax.at/api/venue/contact', { method: 'OPTIONS', headers: ak }), s);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'https://lokale.akiwi.at');
  const r = await handleContact(contactReq({ page: 'lokale', role: 'owner', wish: 'certificate', phone: '0660 1234567', channel: 'whatsapp', topic: 'Kebab Haus', project: 'fightfolio' }, ak), s);
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://lokale.akiwi.at');
  const [q] = await s.store.listRequests();
  assert.equal(q.project, 'akiwi', 'the body cannot choose the project'); assert.equal(q.lokal, 'Kebab Haus'); assert.equal(q.wish, 'certificate');
  assert.deepEqual((await s.store.siteEventRows({ since: '2000-01-01' })).map((e) => [e.page, e.event]), [['akiwi:lokale', 'sent']]);
  // FightFolio's own words; namax words are refused there
  const ff = { origin: 'https://www.fightfolio.de' };
  assert.equal((await handleContact(contactReq({ role: 'fighter', wish: 'profile', phone: '0660 7654321', channel: 'call' }, ff), s)).status, 200);
  assert.equal((await handleContact(contactReq({ role: 'nosite', wish: 'seo', phone: '0660 7654321', channel: 'call' }, ff), s)).status, 400);
  assert.equal((await s.store.listRequests()).filter((x) => x.project === 'fightfolio').length, 1);
  // any other site: refused, nothing stored, no CORS
  for (const origin of ['https://evil.example', 'https://akiwi.at.evil.example', 'http://www.fightfolio.de']) {
    const x = await handleContact(contactReq({ role: 'fighter', wish: 'profile', phone: '0660 7654321', channel: 'call' }, { origin }), s);
    assert.equal(x.status, 403, origin); assert.equal(x.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await s.store.listRequests()).length, 2);
});

test('visits on akiwi.at and fightfolio.de: entry page and source per day; not for namax.at, robots or other sites', async () => {
  const s = await services();
  const hit = (body, headers) => handleContact(contactReq(body, headers), s);
  assert.equal((await hit({ hit: 'google', path: '/R/12?utm=x' }, { origin: 'https://www.akiwi.at' })).status, 204);
  await hit({ hit: 'google', path: '/r/12' }, { origin: 'https://lokale.akiwi.at' });
  await hit({ hit: 'weird', path: '/en/fighters/max/extra/more' }, { origin: 'https://www.fightfolio.de' });
  await hit({ hit: 'direct', path: '/' }, { origin: 'https://www.namax.at' });
  await hit({ hit: 'direct', path: '/' }, { origin: 'https://www.akiwi.at', 'user-agent': 'Googlebot/2.1' });
  assert.equal((await hit({ hit: 'direct', path: '/' }, { origin: 'https://evil.example' })).status, 403);
  const rows = (await s.store.siteHitRows({ since: '2000-01-01' })).map((r) => [r.project, r.page, r.source, r.n]);
  assert.deepEqual(rows, [['akiwi', '/r/12', 'google', 2], ['fightfolio', '/en/fighters/max', 'other', 1]]);
  assert.deepEqual(await s.store.listRequests(), [], 'a visit is never a request');
});

test('akiwi: a guest may write without a number, then the message counts; owners still need one', async () => {
  const s = await services();
  const ak = { origin: 'https://www.akiwi.at' };
  assert.equal((await handleContact(contactReq({ role: 'guest', wish: 'report', phone: '', text: 'Hat zu', topic: 'Döner X' }, ak), s)).status, 200);
  assert.equal((await handleContact(contactReq({ role: 'guest', wish: 'report', phone: '', text: '' }, ak), s)).status, 400);
  assert.equal((await handleContact(contactReq({ role: 'owner', wish: 'fix', phone: '', text: 'Bitte ändern' }, ak), s)).status, 400);
  const [q] = await s.store.listRequests();
  assert.equal(q.project, 'akiwi'); assert.equal(q.role, 'guest'); assert.equal(q.text, 'Hat zu');
});

test('site contact form steps: known words only, per page; Nasim and robots not counted', async () => {
  const s = await services();
  for (const ev of ['open:hero', 'role:nosite', 'wish:seo', 'step:3', 'close:3', 'fail', 'sent', 'name:Ali', '+43 660', 7])
    assert.equal((await handleContact(contactReq({ ev, page: 'webdesign' }), s)).status, 204);
  await handleContact(contactReq({ ev: 'open:dock', page: 'nope' }), s);
  await handleContact(contactReq({ ev: 'open:dock', page: 'home' }, { cookie: 'nx_staff=1' }), s);
  await handleContact(contactReq({ ev: 'open:dock', page: 'home' }, { 'user-agent': 'Googlebot' }), s);
  const rows = (await s.store.siteEventRows({ since: '2000-01-01' })).map((e) => e.page + ' ' + e.event).sort();
  assert.deepEqual(rows, ['home open:dock', 'webdesign close:3', 'webdesign fail', 'webdesign open:hero', 'webdesign role:nosite', 'webdesign step:3', 'webdesign wish:seo']);
  assert.equal((await s.store.listRequests()).length, 0);
});

test('namax.at pages: no WhatsApp or Telegram buttons; every request button opens the form, which every such page loads', () => {
  const pages = ['index.html', 'kostenlos.html', 'webdesign-wien.html', 'social-media-wien.html', 'content-reels-wien.html', 'seo-wien.html', 'online-werbung-wien.html',
    'en/index.html', 'en/free-page.html', 'en/web-design-vienna.html', 'en/social-media-vienna.html', 'en/content-reels-vienna.html', 'en/seo-vienna.html', 'en/online-ads-vienna.html'];
  for (const p of [...pages, 'impressum.html', 'en/impressum.html']) {
    const html = readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /wa\.me|t\.me\//, p);
    if (pages.includes(p)) { assert.match(html, /data-contact="hero"|data-contact="header"/, p); assert.match(html, /src="\/js\/contact\.js\?v=\d+"/, p); }
  }
});
