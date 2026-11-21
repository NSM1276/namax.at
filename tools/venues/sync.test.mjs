import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../api/_lib/venues/store.mjs';
import { isOwner } from '../../api/_lib/venues/owner.mjs';
import { syncVenues, parseKeys, formatKeys, pickVenues } from '../venue-sync.mjs';
import { inboxReport } from '../venue-inbox.mjs';

const v = (slug, extra = {}) => ({ slug, status: 'hidden', kind: 'friseur', name: 'Salon ' + slug, area: 'Meidling',
  address: { street: 'Gasse 1', zip: '1120', city: 'Wien' }, ready: true, internal: { district: 12 }, ...extra });

test('pickVenues filters by district, kind, readiness and limit', () => {
  const all = [v('aaa'), v('bbb', { kind: 'imbiss' }), v('ccc', { internal: { district: 5 } }), v('ddd', { ready: false }), v('eee')];
  assert.deepEqual(pickVenues(all, { district: 12, kind: 'friseur' }).map((x) => x.slug), ['aaa', 'eee']);
  assert.deepEqual(pickVenues(all, { district: 12, kind: 'friseur', limit: 1 }).map((x) => x.slug), ['aaa']);
  assert.deepEqual(pickVenues(all, {}).map((x) => x.slug), ['aaa', 'bbb', 'ccc', 'eee']);
});

test('new venues get a key whose hash is stored; the link carries the key', async () => {
  const store = memoryStore();
  const r = await syncVenues({ store, venues: [v('aaa'), v('bbb')], keys: new Map() });
  assert.deepEqual(r.added, ['aaa', 'bbb']);
  assert.equal(r.keys.size, 2);
  const rec = await store.getVenue('aaa');
  assert.ok(isOwner(rec, r.keys.get('aaa')));
  assert.equal(rec.status, 'hidden', 'hidden unless --public');
  assert.equal(r.links[0].url, `https://aaa.namax.at/?k=${r.keys.get('aaa')}`);
  assert.equal(rec.facts.ready, undefined, 'build flags are not stored');
});

test('--public stores new venues as public', async () => {
  const store = memoryStore();
  await syncVenues({ store, venues: [v('aaa')], keys: new Map(), publish: true });
  assert.equal((await store.getVenue('aaa')).status, 'public');
});

test('a second run updates facts, keeps key and status, and gives the same link', async () => {
  const store = memoryStore();
  const first = await syncVenues({ store, venues: [v('aaa')], keys: new Map() });
  await store.setStatus('aaa', 'public');
  const second = await syncVenues({ store, venues: [v('aaa', { name: 'Neu' })], keys: first.keys });
  assert.deepEqual(second.updated, ['aaa']);
  const rec = await store.getVenue('aaa');
  assert.equal(rec.facts.name, 'Neu');
  assert.equal(rec.status, 'public');
  assert.ok(isOwner(rec, first.keys.get('aaa')));
  assert.equal(second.links[0].url, first.links[0].url);
});

test('removed or do-not-contact venues are never touched and get no link', async () => {
  const store = memoryStore();
  const first = await syncVenues({ store, venues: [v('aaa'), v('bbb')], keys: new Map() });
  await store.setStatus('aaa', 'removed');
  await store.setDoNotContact('bbb', true);
  const again = await syncVenues({ store, venues: [v('aaa', { name: 'X' }), v('bbb', { name: 'Y' })], keys: first.keys });
  assert.deepEqual(again.skipped.sort(), ['aaa', 'bbb']);
  assert.equal(again.links.length, 0);
  assert.equal((await store.getVenue('aaa')).facts.name, 'Salon aaa');
});

test('a venue in the store without a known key gets no link (the key cannot be recovered)', async () => {
  const store = memoryStore();
  await syncVenues({ store, venues: [v('aaa')], keys: new Map() });
  const r = await syncVenues({ store, venues: [v('aaa')], keys: new Map() });
  assert.equal(r.links.length, 0);
  assert.deepEqual(r.noKey, ['aaa']);
});

test('keys file round trip', () => {
  const keys = new Map([['aaa', '0'.repeat(32)], ['bbb', 'f'.repeat(32)]]);
  assert.deepEqual(parseKeys(formatKeys(keys)), keys);
  assert.deepEqual(parseKeys('# comment\n\nbad line\nccc\t' + '1'.repeat(32) + '\n'), new Map([['ccc', '1'.repeat(32)]]));
});

test('inbox: removals first and marked urgent, then questions, then changes', () => {
  const text = inboxReport([
    { slug: 'aaa', type: 'changed', text: 'hours', at: '2026-11-21T10:00:00Z' },
    { slug: 'bbb', type: 'handoff', text: 'Will Online-Buchung', at: '2026-11-21T11:00:00Z' },
    { slug: 'ccc', type: 'removal', text: 'urgent: owner asked', at: '2026-11-21T12:00:00Z' },
    { slug: 'ddd', type: 'confirmed', text: '', at: '2026-11-21T09:00:00Z' },
  ]);
  const iRem = text.indexOf('ccc.namax.at'), iQ = text.indexOf('Will Online-Buchung'), iCh = text.indexOf('aaa.namax.at');
  assert.ok(iRem >= 0 && iRem < iQ && iQ < iCh, text);
  assert.match(text, /URGENT|Срочно/i);
  assert.match(inboxReport([]), /nothing|ничего/i);
});
