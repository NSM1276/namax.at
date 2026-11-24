import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey } from './owner.mjs';
import { handleOg } from './http.mjs';
import { ogImageUrl, ogVersion, ogTree, ogDish, ogDishTree } from './og.mjs';
import { allNicheNames } from './niche.mjs';
import { renderVenue } from './template.mjs';
import { PALETTES } from './themes.mjs';

const facts = JSON.parse(readFileSync(new URL('./fixtures/full.json', import.meta.url)));
const SLUG = facts.slug;
const req = (slug = SLUG, path = '/api/venue/og?v=1') => new Request(`https://${slug}.namax.at${path}`, { headers: { host: `${slug}.namax.at` } });
async function svc(status = 'public', extra = {}) {
  const store = memoryStore();
  await store.upsertFacts(SLUG, { facts: { ...facts, ...extra }, keyHash: hashKey('a'.repeat(32)), status });
  return { store };
}
const isPng = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
// an imbiss with no known food has no niche picture, so its preview is the plate
const PLATE = { kind: 'imbiss', name: 'Buffet zum Freundlichen' };
const PIZZA = { kind: 'imbiss', name: 'Pamir Pizza & Kebab' };

test('preview image is a 1200×630 PNG, cached long, small enough for WhatsApp', async () => {
  const res = await handleOg(req(), await svc('public', PLATE));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /s-maxage=\d{6,}/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(isPng(bytes));
  const view = new DataView(bytes.buffer);
  assert.deepEqual([view.getUint32(16), view.getUint32(20)], [1200, 630]);
  assert.ok(bytes.length < 300_000, `${bytes.length} bytes`);
});

test('hidden pages get an image too (owner links are shared); unknown and removed do not', async () => {
  assert.equal((await handleOg(req(), await svc('hidden'))).status, 200);
  assert.equal((await handleOg(req(), await svc('removed'))).status, 404);
  assert.equal((await handleOg(req('gibt-es-nicht'), await svc())).status, 404);
});

test('names with Turkish letters and every lettering render', async () => {
  for (const lettering of ['block', 'narrow', 'serif']) {
    const res = await handleOg(req(), await svc('public', { name: 'Güzel Kuaför Şişli Çağrı', theme: { palette: 'red-yellow', lettering } }));
    assert.equal(res.status, 200, lettering);
    const b = new Uint8Array(await res.arrayBuffer());
    assert.ok(isPng(b) || isJpeg(b), lettering);
  }
});

test('the picture shows the name, area and kind in the page colors; Ş/ğ/š fall back to the -Ext font', () => {
  const v = { ...facts, theme: { palette: 'cream-green', lettering: 'serif' } };
  const s = JSON.stringify(ogTree(v));
  for (const part of ['FRISEUR', 'MEIDLING', PALETTES['cream-green'].signBg, PALETTES['cream-green'].signInk, 'namax.at', 'DisplayExt', 'TextExt']) assert.ok(s.includes(part), part);
});

test('the picture is an enamel plate in the brand faces, and its address moved on from the old look', () => {
  const v = { ...facts, kind: 'friseur', area: 'Meidling', address: { street: 'Gasse 1', zip: '1120', city: 'Wien' }, theme: { palette: 'blue-white', lettering: 'serif' } };
  const s = JSON.stringify(ogTree(v));
  for (const part of ['"Display, DisplayExt"', '"Text, TextExt"', `solid ${PALETTES['blue-white'].signInk}`, PALETTES['blue-white'].pageBg, '12., MEIDLING', 'FRISEUR']) assert.ok(s.includes(part), part);
  assert.doesNotMatch(s, /Serif|Block|Narrow|Small/, 'old faces are gone');
  assert.notEqual(ogVersion(facts), '99e32e3b43', 'cached old pictures are not served');
});

test('image address changes when the name or look changes, so messengers fetch the new one', () => {
  const a = ogVersion(facts);
  assert.equal(a, ogVersion({ ...facts }));
  assert.notEqual(a, ogVersion({ ...facts, name: facts.name + ' 2' }));
  assert.notEqual(a, ogVersion({ ...facts, theme: { palette: 'blue-white', lettering: 'narrow' } }));
  assert.equal(ogImageUrl(facts), `https://${SLUG}.namax.at/api/venue/og?v=${a}`);
});

test('every venue page carries the preview tags', () => {
  const html = renderVenue(facts);
  for (const s of [
    `<meta property="og:image" content="${ogImageUrl(facts)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:url" content="https://${SLUG}.namax.at/">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ]) assert.ok(html.includes(s), s);
});

test('a page with a niche picture previews that dish as a light JPEG with a small plate; owner photos or a facade bring the plate back', async () => {
  const v = { ...facts, ...PIZZA };
  assert.match(ogDish(v), /^pizza-[23]$/);
  assert.equal(ogDish({ ...v, photos: ['https://x.public.blob.vercel-storage.com/venues/a.jpg'] }), null);
  assert.equal(ogDish({ ...v, facade: 'https://x.public.blob.vercel-storage.com/venues/f.jpg' }), null);
  assert.equal(ogDish({ ...facts, ...PLATE }), null);
  assert.notEqual(ogVersion(v), ogVersion({ ...v, photos: ['x'] }), 'the address moves when the picture does');
  const s = JSON.stringify(ogDishTree(v, ogDish(v)));
  for (const part of ['PAMIR PIZZA & KEBAB', 'IMBISS', 'Symbolbild', 'namax.at', 'data:image/jpeg;base64,']) assert.ok(s.includes(part), part);
  const res = await handleOg(req(), await svc('public', PIZZA));
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  const b = new Uint8Array(await res.arrayBuffer());
  assert.ok(isJpeg(b));
  assert.ok(b.length < 300_000, `${b.length} bytes`);
});

test('the plate words follow the sign: trade word above, the proper name big', () => {
  const s = JSON.stringify(ogTree({ ...facts, kind: 'cafe', name: 'Stella Eissalon / Konditorei / Kaffeehaus' }));
  assert.ok(s.includes('"EISSALON"') && s.includes('"STELLA"'), s.slice(0, 300));
});

test('every niche picture has its preview copy in og-niche/ (tools/og-niche.py), and no stale copies', () => {
  const names = allNicheNames();
  for (const n of names) assert.ok(existsSync(new URL(`./og-niche/${n}.jpg`, import.meta.url)), n);
  const files = readdirSync(new URL('./og-niche/', import.meta.url)).map((f) => f.replace('.jpg', ''));
  assert.deepEqual(files.filter((f) => !names.includes(f)), []);
});

test('venue icons: /favicon.ico is an ICO with a 48px PNG, /favicon.png 192px, /apple-touch-icon.png 180px; others 404', async () => {
  const s = await svc();
  const ico = await handleOg(req(SLUG, '/api/venue/og?icon=ico'), s);
  assert.equal(ico.headers.get('content-type'), 'image/x-icon');
  const b = new Uint8Array(await ico.arrayBuffer());
  assert.deepEqual([...b.slice(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(b[6], 48);
  assert.ok(isPng(b.slice(22)));
  for (const [path, size] of [['/favicon.png', 192], ['/apple-touch-icon.png', 180], ['/api/venue/og?icon=png', 192]]) {
    const r = await handleOg(req(SLUG, path), s);
    assert.equal(r.headers.get('content-type'), 'image/png', path);
    const p = new Uint8Array(await r.arrayBuffer());
    assert.equal(new DataView(p.buffer).getUint32(16), size, path);
  }
  assert.equal((await handleOg(req(SLUG, '/api/venue/og?icon=huge'), s)).status, 404);
  assert.equal((await handleOg(req('gibt-es-nicht', '/favicon.ico'), s)).status, 404);
  const html = renderVenue(facts);
  assert.ok(html.includes('<link rel="icon" type="image/png" sizes="192x192" href="/favicon.png">'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'));
});
