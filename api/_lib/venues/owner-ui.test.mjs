import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore } from './store.mjs';
import { hashKey } from './owner.mjs';
import { renderPage } from './page.mjs';
import { ownerPanel } from './owner-ui.mjs';

const KEY = 'c'.repeat(32);
const facts = JSON.parse(readFileSync(new URL('./fixtures/full.json', import.meta.url)));

async function pages() {
  const store = memoryStore();
  await store.upsertFacts('friseur-meidling', { facts, keyHash: hashKey(KEY), status: 'public' });
  await store.setChatOpen('friseur-meidling', true);
  const owner = await renderPage({ store, slug: 'friseur-meidling', key: KEY, ownerPart: ownerPanel });
  const pub = await renderPage({ store, slug: 'friseur-meidling', key: '', ownerPart: ownerPanel });
  return { owner: owner.body, pub: pub.body };
}

test('the owner page has the chat dialog; the key is never in the HTML', async () => {
  const { owner, pub } = await pages();
  assert.match(owner, /role="dialog"/);
  assert.match(owner, /aria-modal="true"/);
  assert.ok(!owner.includes(KEY) && !pub.includes(KEY));
  assert.ok(!pub.includes('data-oc'), 'no chat for visitors');
  assert.ok(pub.includes("sendBeacon('/api/venue/hit'"), 'visitors are counted');
});

test('the panel carries labels for all 6 languages and no contact details', async () => {
  const p = ownerPanel({ venue: { hours: null, phone: '' } });
  for (const word of ['Speichern', 'Kaydet', 'حفظ', 'ذخیره', 'Save', 'Sačuvaj']) assert.ok(p.script.includes(word), word);
  assert.doesNotMatch(p.html + p.script, /wa\.me|tel:|\+43/);
  assert.ok(!/<\/script/i.test(p.script), 'data cannot close the script tag');
});
