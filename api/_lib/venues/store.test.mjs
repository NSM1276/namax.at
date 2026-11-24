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

  test(`${prefix}context: null until set, kept apart from facts, survives a facts re-sync; unknown slugs skipped`, async () => {
    const s = await fresh();
    assert.equal((await s.getVenue(A)).context, null);
    const ctx = { near: [{ slug: B, name: 'B', kind: 'cafe', m: 40 }], stop: null, facts: [], cuisine: [], map: { w: 600, h: 340, streets: [], dots: [] } };
    assert.equal(await s.setContexts([{ slug: A, context: ctx }, { slug: prefix + 'nope', context: ctx }]), 1);
    assert.deepEqual((await s.getVenue(A)).context, ctx);
    await s.upsertFacts(A, { facts: facts(A), keyHash: 'h-a', status: 'public' });
    assert.deepEqual((await s.getVenue(A)).context, ctx, 'a facts re-sync keeps the context');
    assert.equal((await s.getVenue(B)).context, null);
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
    await s.addHit(A, { owner: false, day: '2026-11-21', source: 'google' });
    await s.addHit(A, { owner: false, day: '2026-11-22', source: 'direct' });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    assert.deepEqual(await s.getHits(A), { visitors: 2, owner: 1 });
    assert.deepEqual(await s.getHits(B), { visitors: 0, owner: 0 });
  });

  test('a visitor hit without a source (the old load beacon) is not counted', async () => {
    const s = await fresh();
    await s.addHit(A, { owner: false, day: '2026-11-22' });
    assert.deepEqual(await s.getHits(A), { visitors: 0, owner: 0 });
    assert.deepEqual(await s.hitSummary({ today: '2026-11-22', weekStart: '2026-11-16' }), []);
  });

  test('hit sources: visitors of the last 7 days per source, over all pages', async () => {
    const s = await fresh();
    for (const [slug, day, source] of [[A, '2026-11-22', 'google'], [B, '2026-11-20', 'google'], [A, '2026-11-21', 'namax'], [A, '2026-11-01', 'social']])
      await s.addHit(slug, { owner: false, day, source });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    assert.deepEqual(await s.hitSources({ today: '2026-11-22', weekStart: '2026-11-16' }), { google: 2, namax: 1 });
  });

  test('statistics rows: visitor views per page, day and source since a day; owner views left out', async () => {
    const s = await fresh();
    for (const [slug, day, source] of [[A, '2026-11-22', 'google'], [A, '2026-11-22', 'google'], [B, '2026-11-20', 'direct'], [A, '2026-09-01', 'social']])
      await s.addHit(slug, { owner: false, day, source });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    const rows = (await s.hitRows({ since: '2026-10-01' })).sort((x, y) => x.slug.localeCompare(y.slug));
    assert.deepEqual(rows, [{ slug: A, day: '2026-11-22', source: 'google', n: 2 }, { slug: B, day: '2026-11-20', source: 'direct', n: 1 }]);
  });

  test('owner form events: counted per page, day and event', async () => {
    const s = await fresh();
    for (const [slug, day, event] of [[A, '2026-11-22', 'open:niche'], [A, '2026-11-22', 'open:niche'], [A, '2026-11-22', 'sent'], [B, '2026-09-01', 'open:link']])
      await s.addClaimEvent(slug, { day, event });
    const rows = (await s.claimEventRows({ since: '2026-10-01' })).sort((x, y) => x.event.localeCompare(y.event));
    assert.deepEqual(rows, [{ slug: A, day: '2026-11-22', event: 'open:niche', n: 2 }, { slug: A, day: '2026-11-22', event: 'sent', n: 1 }]);
  });

  test('hit sources by page: where the visitors of each page of the last 7 days came from', async () => {
    const s = await fresh();
    for (const [slug, day, source] of [[A, '2026-11-22', 'google'], [A, '2026-11-22', 'google'], [B, '2026-11-20', 'direct'], [A, '2026-11-21', 'namax'], [A, '2026-11-01', 'social']])
      await s.addHit(slug, { owner: false, day, source });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    assert.deepEqual(await s.hitSourcesBySlug({ today: '2026-11-22', weekStart: '2026-11-16' }), { [A]: { google: 2, namax: 1 }, [B]: { direct: 1 } });
  });

  test('hits by window: today, the last 7 days and in total; owner views never count as visits', async () => {
    const s = await fresh();
    for (const day of ['2026-11-01', '2026-11-16', '2026-11-22', '2026-11-22']) await s.addHit(A, { owner: false, day, source: 'direct' });
    await s.addHit(A, { owner: true, day: '2026-11-22' });
    await s.addHit(B, { owner: false, day: '2026-11-20', source: 'google' });
    const w = { today: '2026-11-22', weekStart: '2026-11-16' };
    assert.deepEqual(await s.getHits(A, w), { visitors: 4, owner: 1, today: 2, week: 3 });
    assert.deepEqual(await s.getHits(B, w), { visitors: 1, owner: 0, today: 0, week: 1 });
    const sum = await s.hitSummary(w);
    assert.deepEqual(sum, [{ slug: A, today: 2, week: 3, total: 4 }, { slug: B, today: 0, week: 1, total: 1 }]);
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

  test('the facade photo url is stored, listed and cleared', async () => {
    const s = await fresh();
    assert.equal((await s.getVenue(A)).facadeUrl, null);
    await s.setFacade(A, 'https://x/f.jpg');
    assert.equal((await s.getVenue(A)).facadeUrl, 'https://x/f.jpg');
    assert.equal((await s.listForAdmin()).find((r) => r.slug === A).facadeUrl, 'https://x/f.jpg');
    await s.setFacade(A, null);
    assert.equal((await s.getVenue(A)).facadeUrl, null);
  });

  test('listSlugs by status', async () => {
    const s = await fresh();
    assert.deepEqual((await s.listSlugs('public')).filter((x) => x.startsWith(prefix)), [A]);
  });

  test('publicAmong keeps only the given slugs whose page is public', async () => {
    const s = await fresh();
    assert.deepEqual(await s.publicAmong([B, A, prefix + 'nope', A]), [A]);
    assert.deepEqual(await s.publicAmong([]), []);
  });

  const req = (extra = {}) => ({ role: 'owner', wish: 'fix', name: 'Ali', phone: '+43 660 1234567', channel: 'call', text: 'Hallo', ...extra });
  const mine = async (s) => (await s.listRequests()).filter((r) => r.slug.startsWith(prefix));

  test('requests: add, list open first (website wishes first) then newest, mark done and back', async () => {
    const s = await fresh();
    const a = await s.addRequest(A, req());
    const b = await s.addRequest(B, req({ wish: 'remove', channel: 'whatsapp' }));
    const c = await s.addRequest(A, req({ wish: 'website' }));
    await s.setRequestDone(b, true);
    let rows = await mine(s);
    assert.deepEqual(rows.map((r) => r.id), [c, a, b]);
    assert.deepEqual({ ...rows[1], at: undefined }, { id: a, slug: A, venueName: 'X ' + A, role: 'owner', wish: 'fix', name: 'Ali',
      phone: '+43 660 1234567', channel: 'call', text: 'Hallo', lokal: '', at: undefined, doneAt: null });
    assert.ok(!Number.isNaN(Date.parse(rows[1].at)));
    assert.ok(!Number.isNaN(Date.parse(rows[2].doneAt)));
    assert.equal(rows[2].channel, 'whatsapp');
    await s.setRequestDone(b, false);
    rows = await mine(s);
    assert.deepEqual(rows.map((r) => r.id), [c, b, a]);
    assert.equal(rows.find((r) => r.id === b).doneAt, null);
  });

  test('requests: a venue we do not list (no slug) keeps its name; directory lists public venues only', async () => {
    const s = await fresh();
    const id = await s.addRequest(null, req({ lokal: 'Neues Café, 1160 Wien' }));
    const row = (await s.listRequests()).find((r) => r.id === id);
    assert.equal(row.slug, null); assert.equal(row.lokal, 'Neues Café, 1160 Wien'); assert.equal(row.venueName, '');
    const dir = await s.listDirectory();
    assert.ok(dir.every((v) => typeof v.name === 'string' && typeof v.zip === 'string'));
  });

  test('requests: count per venue since a time', async () => {
    const s = await fresh();
    const before = new Date(Date.now() - 60_000).toISOString();
    await s.addRequest(A, req()); await s.addRequest(A, req()); await s.addRequest(B, req());
    assert.equal(await s.countRequestsSince(A, before), 2);
    assert.equal(await s.countRequestsSince(B, before), 1);
    assert.equal(await s.countRequestsSince(A, new Date(Date.now() + 60_000).toISOString()), 0);
  });

  test('requests: purge done after 90 days, open after 180 days', async () => {
    const s = await fresh();
    const open = await s.addRequest(A, req());
    const done = await s.addRequest(A, req());
    await s.setRequestDone(done, true);
    const day = 86_400_000;
    await s.purgeRequests(new Date().toISOString());
    assert.equal((await mine(s)).length, 2);
    await s.purgeRequests(new Date(Date.now() + 100 * day).toISOString());
    assert.deepEqual((await mine(s)).map((r) => r.id), [open]);
    await s.purgeRequests(new Date(Date.now() + 200 * day).toISOString());
    assert.deepEqual(await mine(s), []);
  });

  test('requests: a removed venue\'s request keeps the venue name', async () => {
    const s = await fresh();
    await s.addRequest(A, req({ wish: 'remove' }));
    await s.setStatus(A, 'removed');
    assert.equal((await mine(s))[0].venueName, 'X ' + A);
  });

  test('chat: closed by default, opened and closed again', async () => {
    const s = await fresh();
    assert.equal((await s.getVenue(A)).chatOpen, false);
    await s.setChatOpen(A, true);
    assert.equal((await s.getVenue(A)).chatOpen, true);
    assert.equal((await s.listForAdmin()).find((r) => r.slug === A).chatOpen, true);
    await s.setChatOpen(A, false);
    assert.equal((await s.getVenue(A)).chatOpen, false);
  });

  test('requests: counted per sender and in total since a time', async () => {
    const s = await fresh();
    const before = new Date(Date.now() - 60_000).toISOString();
    const base = await s.countAllRequestsSince(before);
    await s.addRequest(A, req({ ipHash: prefix + 'ip1' })); await s.addRequest(B, req({ ipHash: prefix + 'ip1' })); await s.addRequest(B, req({ ipHash: prefix + 'ip2' }));
    assert.equal(await s.countRequestsByIpSince(prefix + 'ip1', before), 2);
    assert.equal(await s.countRequestsByIpSince(prefix + 'ip2', before), 1);
    assert.equal(await s.countAllRequestsSince(before), base + 3);
    assert.equal((await mine(s))[0].ipHash, undefined, 'the sender hash never leaves the store');
  });
}

storeContract(() => memoryStore());
