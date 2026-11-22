// Storage for venues, owner changes, chat, photos, events and visits.
// memoryStore() is used by tests and the local preview; pg-store.mjs implements the same interface on Postgres.
//
// getVenue(slug) → { slug, keyHash, status, facts, changes, pending, confirmedAt, doNotContact, chatState } | null
// upsertFacts(slug, { facts, keyHash, status })  insert; on an existing slug replace facts only
// setPending(slug, changes) → id                  pending.createdAfterMessageId = last message id at that moment
// applyPending(slug, pendingId?) → changes | null (only that proposal, when an id is given);  clearPending(slug)
// setStatus, setConfirmed, setDoNotContact, setChatState
// addMessage(slug, { role, content }) → id;  listMessages(slug, limit);  countOwnerMessagesSince(slug, iso)
// addPhoto(slug, { url, kind }) → id;  listPhotos;  setPhotoKind(slug, id, kind);  removePhoto;  countPhotosSince
// addEvent(slug, { type, text });  listEvents(sinceIso);  countEventsSince(slug, type, sinceIso)
// addHit(slug, { owner, day });  getHits(slug) → { visitors, owner }
// recordModelCall(slug);  countModelCalls(slug, sinceIso?)
// listSlugs(status) → slugs
// setKeyHash(slug, hash);  setOwnerKeyEnc(slug, enc);  setFacade(slug, url|null)
// setContexts([{ slug, context }]) → number updated (unknown slugs skipped); getVenue(...).context is null until set
// listForAdmin() → [{ slug, status, facts, changes, confirmedAt, ownerKeyEnc, facadeUrl, chatOpen }] (not removed)
// setChatOpen(slug, bool): the owner chat works only for venues Nasim opened it for (closed by default)
// addRequest(slug, { role, wish, name, phone, channel, text }) → id;  listRequests() (open first, website wishes first, newest)
// setRequestDone(id, bool);  countRequestsSince(slug, iso);  countRequestsByIpSince(ipHash, iso);  countAllRequestsSince(iso);  purgeRequests(nowIso): done > 90 days, open > 180 days

const clone = (x) => (x == null ? x : structuredClone(x));
/** Open requests first, among them "own website" wishes first, then newest first. */
const requestOrder = (a, b) => (Boolean(a.doneAt) - Boolean(b.doneAt))
  || (!a.doneAt && ((b.wish === 'website') - (a.wish === 'website')))
  || b.at.localeCompare(a.at) || b.id - a.id;

export function memoryStore() {
  const venues = new Map();
  const messages = [], photos = [], events = [], hits = [], modelCalls = [];
  let requests = [];
  let seq = 0;
  const nowIso = () => new Date().toISOString();
  const need = (slug) => {
    const v = venues.get(slug);
    if (!v) throw new Error(`unknown venue ${slug}`);
    return v;
  };

  return {
    async getVenue(slug) {
      const v = venues.get(slug);
      return v ? { facadeUrl: null, chatOpen: false, context: null, ...clone(v) } : null;
    },
    async upsertFacts(slug, { facts, keyHash, status = 'hidden' }) {
      const v = venues.get(slug);
      if (v) { v.facts = clone(facts); return; }
      venues.set(slug, { slug, keyHash, status, facts: clone(facts), changes: {}, pending: null,
        confirmedAt: null, doNotContact: false, chatState: {} });
    },
    async setPending(slug, changes) {
      const v = need(slug);
      const mine = messages.filter((m) => m.slug === slug);
      const id = ++seq;
      v.pending = { id, changes: clone(changes), createdAfterMessageId: mine.length ? mine[mine.length - 1].id : 0 };
      return id;
    },
    async applyPending(slug, pendingId) {
      const v = need(slug);
      if (!v.pending) return null;
      if (pendingId !== undefined && v.pending.id !== Number(pendingId)) return null;
      const c = v.pending.changes;
      v.changes = { ...v.changes, ...clone(c) };
      v.pending = null;
      return clone(c);
    },
    async clearPending(slug) { need(slug).pending = null; },
    async setStatus(slug, status) { need(slug).status = status; },
    async setConfirmed(slug, iso) { need(slug).confirmedAt = iso; },
    async setDoNotContact(slug, value) { need(slug).doNotContact = Boolean(value); },
    async setChatState(slug, state) { need(slug).chatState = clone(state); },

    async addMessage(slug, { role, content }) {
      need(slug);
      const id = ++seq;
      messages.push({ id, slug, role, content, at: nowIso() });
      return id;
    },
    async listMessages(slug, limit) {
      return messages.filter((m) => m.slug === slug).slice(-limit).map(({ slug: _, ...m }) => ({ ...m }));
    },
    async countOwnerMessagesSince(slug, iso) {
      return messages.filter((m) => m.slug === slug && m.role === 'owner' && m.at >= iso).length;
    },

    async addPhoto(slug, { url, kind }) {
      need(slug);
      const id = ++seq;
      photos.push({ id, slug, url, kind, at: nowIso() });
      return id;
    },
    async listPhotos(slug) {
      return photos.filter((p) => p.slug === slug).map(({ slug: _, ...p }) => ({ ...p }));
    },
    async setPhotoKind(slug, id, kind) {
      const p = photos.find((x) => x.slug === slug && x.id === Number(id));
      if (p) p.kind = kind;
    },
    async removePhoto(slug, id) {
      const i = photos.findIndex((x) => x.slug === slug && x.id === Number(id));
      if (i >= 0) photos.splice(i, 1);
    },
    async countPhotosSince(slug, iso) {
      return photos.filter((p) => p.slug === slug && p.at >= iso).length;
    },

    async addEvent(slug, { type, text = '' }) { events.push({ slug, type, text, at: nowIso() }); },
    async listEvents(sinceIso) { return events.filter((e) => e.at >= sinceIso).map((e) => ({ ...e })); },
    async countEventsSince(slug, type, sinceIso) { return events.filter((e) => e.slug === slug && e.type === type && e.at >= sinceIso).length; },

    async addHit(slug, { owner, day }) {
      let h = hits.find((x) => x.slug === slug && x.day === day);
      if (!h) { h = { slug, day, visitors: 0, owner: 0 }; hits.push(h); }
      if (owner) h.owner++; else h.visitors++;
    },
    /** window { today, weekStart } (YYYY-MM-DD) adds visits today and since weekStart. */
    async getHits(slug, window = null) {
      const mine = hits.filter((h) => h.slug === slug);
      const out = { visitors: mine.reduce((a, h) => a + h.visitors, 0), owner: mine.reduce((a, h) => a + h.owner, 0) };
      if (!window) return out;
      return { ...out, today: mine.filter((h) => h.day === window.today).reduce((a, h) => a + h.visitors, 0),
        week: mine.filter((h) => h.day >= window.weekStart).reduce((a, h) => a + h.visitors, 0) };
    },
    /** → [{ slug, today, week, total }] visitor views per venue that has any, most this week first. */
    async hitSummary({ today, weekStart }) {
      const by = new Map();
      for (const h of hits) {
        if (!h.visitors) continue;
        const x = by.get(h.slug) || { slug: h.slug, today: 0, week: 0, total: 0 };
        x.total += h.visitors;
        if (h.day === today) x.today += h.visitors;
        if (h.day >= weekStart) x.week += h.visitors;
        by.set(h.slug, x);
      }
      return [...by.values()].sort((a, b) => b.week - a.week || b.total - a.total || a.slug.localeCompare(b.slug));
    },

    async recordModelCall(slug) { modelCalls.push({ slug, at: nowIso() }); },
    async countModelCalls(slug, sinceIso) {
      return modelCalls.filter((c) => c.slug === slug && (!sinceIso || c.at >= sinceIso)).length;
    },

    async listSlugs(status) {
      return [...venues.values()].filter((v) => v.status === status).map((v) => v.slug).sort();
    },
    async setKeyHash(slug, hash) { need(slug).keyHash = hash; },
    async setOwnerKeyEnc(slug, enc) { need(slug).ownerKeyEnc = enc; },
    async setFacade(slug, url) { need(slug).facadeUrl = url || null; },
    async setContexts(entries) {
      let n = 0;
      for (const e of entries) { const v = venues.get(e.slug); if (v) { v.context = clone(e.context); n++; } }
      return n;
    },
    async listForAdmin() {
      return [...venues.values()].filter((v) => v.status !== 'removed').sort((a, b) => a.slug.localeCompare(b.slug))
        .map((v) => ({ slug: v.slug, status: v.status, facts: clone(v.facts), changes: clone(v.changes),
          confirmedAt: v.confirmedAt, ownerKeyEnc: v.ownerKeyEnc || null, facadeUrl: v.facadeUrl || null, chatOpen: Boolean(v.chatOpen) }));
    },
    async setChatOpen(slug, open) { need(slug).chatOpen = Boolean(open); },

    async addRequest(slug, { role, wish, name = '', phone, channel, text = '', ipHash = '' }) {
      need(slug);
      const id = ++seq;
      requests.push({ id, slug, role, wish, name, phone, channel, text, ipHash, at: nowIso(), doneAt: null });
      return id;
    },
    async listRequests() {
      return requests.map((r) => ({ ...r, venueName: venues.get(r.slug)?.facts?.name ?? '' }))
        .sort(requestOrder)
        .map(({ id, slug, venueName, role, wish, name, phone, channel, text, at, doneAt }) =>
          ({ id, slug, venueName, role, wish, name, phone, channel, text, at, doneAt }));
    },
    async setRequestDone(id, done) {
      const r = requests.find((x) => x.id === Number(id));
      if (r) r.doneAt = done ? nowIso() : null;
    },
    async countRequestsSince(slug, iso) { return requests.filter((r) => r.slug === slug && r.at >= iso).length; },
    async countRequestsByIpSince(ipHash, iso) { return requests.filter((r) => r.ipHash === ipHash && r.at >= iso).length; },
    async countAllRequestsSince(iso) { return requests.filter((r) => r.at >= iso).length; },
    async purgeRequests(now) {
      const t = Date.parse(now), day = 86_400_000;
      requests = requests.filter((r) => (r.doneAt ? Date.parse(r.doneAt) >= t - 90 * day : Date.parse(r.at) >= t - 180 * day));
    },
  };
}
