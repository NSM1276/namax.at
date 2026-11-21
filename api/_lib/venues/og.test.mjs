import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey } from './owner.mjs';
import { handleOg } from './http.mjs';
import { ogImageUrl, ogVersion, ogTree } from './og.mjs';
import { renderVenue } from './template.mjs';

const facts = JSON.parse(readFileSync(new URL('./fixtures/full.json', import.meta.url)));
const SLUG = facts.slug;
const req = (slug = SLUG, path = '/api/venue/og?v=1') => new Request(`https://${slug}.namax.at${path}`, { headers: { host: `${slug}.namax.at` } });
async function svc(status = 'public', extra = {}) {
  const store = memoryStore();
  await store.upsertFacts(SLUG, { facts: { ...facts, ...extra }, keyHash: hashKey('a'.repeat(32)), status });
  return { store };
}
const isPng = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

test('preview image is a 1200×630 PNG, cached long, small enough for WhatsApp', async () => {
  const res = await handleOg(req(), await svc());
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
    assert.ok(isPng(new Uint8Array(await res.arrayBuffer())), lettering);
  }
});

test('the picture shows the name, area and kind in the page colors; Ş/ğ/š fall back to the -Ext font', () => {
  const v = { ...facts, theme: { palette: 'cream-green', lettering: 'serif' } };
  const s = JSON.stringify(ogTree(v));
  for (const part of [v.name, '#1f4d3a', '#f3ead7', 'namax.at', 'SerifExt', 'SmallExt']) assert.ok(s.includes(part), part);
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
