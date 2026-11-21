import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './store.mjs';

const facts = (slug, extra = {}) => ({ slug, status: 'public', kind: 'friseur', name: 'X ' + slug,
  address: { street: 'Gasse 1', zip: '1120', city: 'Wien' }, ...extra });

/** Runs the store contract against any implementation; makeStore() returns a fresh, empty store. */
export function storeContract(makeStore, prefix = '') {
  const A = prefix + 'venue-a', B = prefix + 'venue-b';
  const fresh = async () => {
    const s = await makeStore();
    await s.upsertFacts(A, { facts: facts(A), keyHash: 'h-a', status: 'public' });
    await s.upsertFacts(B, { facts: facts(B), keyHash: 'h-b', status: 'hidden' });
    return s;
  };

  test('unknown slug → null', async () => {
    const s = await fresh();
    assert.equal(await s.getVenue(prefix + 'nope'), null);
  });

  test('a new venue starts clean', async () => {
    const s = await fresh();
    const v = await s.getVenue(A);
    assert.equal(v.slug, A); assert.equal(v.keyHash, 'h-a'); assert.equal(v.status, 'public');
    assert.deepEqual(v.changes, {}); assert.equal(v.pending, null); assert.equal(v.confirmedAt, null);
    assert.equal(v.doNotContact, false); assert.deepEqual(v.chatState, {});
    assert.equal(v.facts.name, 'X ' + A);
  });

  test('upsertFacts again replaces facts only', async () => {
    const s = await fresh();
    await s.setPending(A, { phone: '+4312345678' });
    await s.applyPending(A);
    await s.setStatus(A, 'removed');
    await s.addPhoto(A, { url: 'https://x.public.blob.vercel-storage.com/a.jpg', kind: 'show' });
    await s.addMessage(A, { role: 'owner', content: 'hi' });
    await s.setChatState(A, { lang: 'tr' });
    await s.setDoNotContact(A, true);
    await s.upsertFacts(A, { facts: facts(A, { name: 'Neu' }), keyHash: 'other', status: 'public' });
    const v = await s.getVenue(A);
    assert.equal(v.facts.name, 'Neu');
    assert.equal(v.keyHash, 'h-a', 'key hash is set once');
    assert.equal(v.status, 'removed', 'status is not reset by a facts update');
    assert.deepEqual(v.changes, { phone: '+4312345678' });
    assert.equal((await s.listPhotos(A)).length, 1);
    assert.equal((await s.listMessages(A, 10)).length, 1);
    assert.deepEqual(v.chatState, { lang: 'tr' });
    assert.equal(v.doNotContact, true);
  });

  test('applyPending with nothing pending → null and no change', async () => {
    const s = await fresh();
    assert.equal(await s.applyPending(A), null);
    assert.deepEqual((await s.getVenue(A)).changes, {});
  });

  test('applyPending merges field by field and clears pending', async () => {
    const s = await fresh();
    await s.setPending(A, { phone: '+4312345678' });
    await s.applyPending(A);
    const id = await s.setPending(A, { hours: [null, null, null, null, null, null, [540, 1020]] });
    assert.ok(id);
    assert.equal((await s.getVenue(A)).pending.id, id);
    const applied = await s.applyPending(A);
    assert.deepEqual(applied, { hours: [null, null, null, null, null, null, [540, 1020]] });
    const v = await s.getVenue(A);
    assert.equal(v.pending, null);
    assert.equal(v.changes.phone, '+4312345678');
    assert.deepEqual(v.changes.hours[6], [540, 1020]);
  });

  test('applyPending with an id applies only that proposal', async () => {
    const s = await fresh();
    const old = await s.setPending(A, { phone: '+4312345678' });
    await s.setPending(A, { phone: '+4399999999' });
    assert.equal(await s.applyPending(A, old), null);
    assert.deepEqual((await s.getVenue(A)).changes, {});
    const cur = (await s.getVenue(A)).pending.id;
    assert.deepEqual(await s.applyPending(A, cur), { phone: '+4399999999' });
  });

  test('clearPending drops the proposal and keeps the changes', async () => {
    const s = await fresh();
    await s.setPending(A, { phone: '+4312345678' });
    await s.clearPending(A);
    const v = await s.getVenue(A);
    assert.equal(v.pending, null);
    assert.deepEqual(v.changes, {});
  });

  test('pending remembers the last message id at the time it was made', async () => {
    const s = await fresh();
    const m = await s.addMessage(A, { role: 'owner', content: 'Samstag bis 17' });
    await s.setPending(A, { phone: '+4312345678' });
    assert.equal((await s.getVenue(A)).pending.createdAfterMessageId, m);
  });

  test('messages: last n, oldest first, per venue', async () => {
    const s = await fresh();
    for (const c of ['1', '2', '3']) await s.addMessage(A, { role: 'owner', content: c });
    await s.addMessage(B, { role: 'owner', content: 'b' });
    assert.deepEqual((await s.listMessages(A, 2)).map((m) => m.content), ['2', '3']);
    assert.deepEqual((await s.listMessages(B, 10)).map((m) => m.content), ['b']);
    const since = new Date(Date.now() - 60_000).toISOString();
    assert.equal(await s.countOwnerMessagesSince(A, since), 3);
    assert.equal(await s.countOwnerMessagesSince(A, new Date(Date.now() + 60_000).toISOString()), 0);
  });

  test('photos belong to one venue; removePhoto with another venue does nothing', async () => {
    const s = await fresh();
    const id = await s.addPhoto(A, { url: 'https://x.public.blob.vercel-storage.com/a.jpg', kind: 'priceboard' });
    assert.equal((await s.listPhotos(B)).length, 0);
    await s.removePhoto(B, id);
    assert.equal((await s.listPhotos(A)).length, 1);
    await s.setPhotoKind(B, id, 'show');
    assert.equal((await s.listPhotos(A))[0].kind, 'priceboard');
    await s.setPhotoKind(A, id, 'show');
    assert.equal((await s.listPhotos(A))[0].kind, 'show');
    assert.equal(await s.countPhotosSince(A, new Date(Date.now() - 60_000).toISOString()), 1);
    await s.removePhoto(A, id);
    assert.equal((await s.listPhotos(A)).length, 0);
  });

  test('status, confirmation, events', async () => {
    const s = await fresh();
    await s.setConfirmed(A, '2026-11-21T10:00:00.000Z');
    await s.setStatus(B, 'removed');
    await s.addEvent(A, { type: 'confirmed', text: '' });
    await s.addEvent(B, { type: 'removal', text: 'urgent' });
    assert.equal((await s.getVenue(A)).confirmedAt, '2026-11-21T10:00:00.000Z');
    assert.equal((await s.getVenue(B)).status, 'removed');
    const ev = await s.listEvents(new Date(Date.now() - 60_000).toISOString());
    assert.deepEqual(ev.filter((e) => e.slug.startsWith(prefix)).map((e) => [e.slug, e.type]).sort(), [[A, 'confirmed'], [B, 'removal']]);
  });

  test('events are counted per venue and type', async () => {
    const s = await fresh();
    const since = new Date(Date.now() - 60_000).toISOString();
    await s.addEvent(A, { type: 'photo', text: 'u1' });
    await s.addEvent(A, { type: 'photo', text: 'u2' });
    await s.addEvent(A, { type: 'confirmed' });
    await s.addEvent(B, { type: 'photo', text: 'u3' });
    assert.equal(await s.countEventsSince(A, 'photo', since), 2);
    assert.equal(await s.countEventsSince(B, 'photo', since), 1);
    assert.equal(await s.countEventsSince(A, 'photo', new Date(Date.now() + 60_000).toISOString()), 0);
  });

  test('hits count visitors and owner separately', async () => {
    const s = await fresh();
    await s.addHit(A, { owner: false, day: '2026-11-21' });
    await s.addHit(A, { owner: false, day: '2026-11-22' });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    assert.deepEqual(await s.getHits(A), { visitors: 2, owner: 1 });
    assert.deepEqual(await s.getHits(B), { visitors: 0, owner: 0 });
  });

  test('model calls are counted per venue', async () => {
    const s = await fresh();
    await s.recordModelCall(A);
    await s.recordModelCall(A);
    assert.equal(await s.countModelCalls(A), 2);
    assert.equal(await s.countModelCalls(A, new Date(Date.now() - 60_000).toISOString()), 2);
    assert.equal(await s.countModelCalls(A, new Date(Date.now() + 60_000).toISOString()), 0);
    assert.equal(await s.countModelCalls(B), 0);
  });

  test('sealed owner keys are stored and listed with the facts; removed venues are not listed', async () => {
    const s = await fresh();
    await s.setOwnerKeyEnc(A, 'sealed-a');
    await s.setStatus(B, 'removed');
    const rows = (await s.listForAdmin()).filter((r) => r.slug.startsWith(prefix));
    assert.deepEqual(rows.map((r) => r.slug), [A]);
    assert.equal(rows[0].ownerKeyEnc, 'sealed-a'); assert.equal(rows[0].status, 'public');
    assert.equal(rows[0].facts.name, 'X ' + A); assert.equal(rows[0].confirmedAt, null); assert.deepEqual(rows[0].changes, {});
  });

  test('the owner key hash can be replaced', async () => {
    const s = await fresh();
    await s.setKeyHash(A, 'f'.repeat(64));
    assert.equal((await s.getVenue(A)).keyHash, 'f'.repeat(64));
  });

  test('listSlugs by status', async () => {
    const s = await fresh();
    assert.deepEqual((await s.listSlugs('public')).filter((x) => x.startsWith(prefix)), [A]);
  });
}

storeContract(() => memoryStore());
