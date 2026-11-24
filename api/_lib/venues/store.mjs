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
// addHit(slug, { owner, day, source });  getHits(slug) → { visitors, owner };  hitSources({ weekStart }) → { source: n };  hitSourcesBySlug({ weekStart }) → { slug: { source: n } }
// hitRows({ since }) → [{ slug, day, source, n }];  addClaimEvent(slug, { day, event });  claimEventRows({ since }) → [{ slug, day, event, n }]
// addSiteEvent({ day, page, event });  siteEventRows({ since }) → [{ day, page, event, n }] (the contact form on namax.at)
// recordModelCall(slug);  countModelCalls(slug, sinceIso?)
// listSlugs(status) → slugs
// setKeyHash(slug, hash);  setOwnerKeyEnc(slug, enc);  setFacade(slug, url|null)
// publicAmong(slugs) → the given slugs whose page is public now (for the neighbours on a page)
// setContexts([{ slug, context }]) → number updated (unknown slugs skipped); getVenue(...).context is null until set
// listForAdmin() → [{ slug, status, facts, changes, confirmedAt, ownerKeyEnc, facadeUrl, chatOpen }] (not removed)
// setChatOpen(slug, bool): the owner chat works only for venues Nasim opened it for (closed by default)
// listDirectory() → [{ slug, name, street, zip, city }] of public venues (the search on namax.at/kostenlos)
// addRequest(slug|null, { role, wish, name, phone, channel, text, lokal, project }) → id (null slug: a venue we do not list, named in lokal);  listRequests() (open first, website wishes first, newest)
// setRequestDone(id, bool);  countRequestsSince(slug, iso);  countRequestsByIpSince(ipHash, iso);  countAllRequestsSince(iso);  purgeRequests(nowIso): done > 90 days, open > 180 days

const clone = (x) => (x == null ? x : structuredClone(x));
/** Open requests first, among them "own website" wishes first, then newest first. */
const requestOrder = (a, b) => (Boolean(a.doneAt) - Boolean(b.doneAt))
  || (!a.doneAt && ((b.wish === 'website') - (a.wish === 'website')))
  || b.at.localeCompare(a.at) || b.id - a.id;

export function memoryStore() {
  const venues = new Map();
  const messages = [], photos = [], events = [], hits = [], srcHits = [], modelCalls = [], claimEvents = [], siteEvents = [];
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

    // Owner views per day (hits) and visitor views per day and source (srcHits). A visitor view without a source
    // (the old load beacon) is not counted, so only views that passed the person check add up.
    async addHit(slug, { owner, day, source = null }) {
      if (owner) {
        let h = hits.find((x) => x.slug === slug && x.day === day);
        if (!h) { h = { slug, day, owner: 0 }; hits.push(h); }
        h.owner++;
      } else if (source) {
        let h = srcHits.find((x) => x.slug === slug && x.day === day && x.source === source);
        if (!h) { h = { slug, day, source, n: 0 }; srcHits.push(h); }
        h.n++;
      }
    },
    /** window { today, weekStart } (YYYY-MM-DD) adds visits today and since weekStart. */
    async getHits(slug, window = null) {
      const mine = srcHits.filter((h) => h.slug === slug);
      const out = { visitors: mine.reduce((a, h) => a + h.n, 0), owner: hits.filter((h) => h.slug === slug).reduce((a, h) => a + h.owner, 0) };
      if (!window) return out;
      return { ...out, today: mine.filter((h) => h.day === window.today).reduce((a, h) => a + h.n, 0),
        week: mine.filter((h) => h.day >= window.weekStart).reduce((a, h) => a + h.n, 0) };
    },
    /** → [{ slug, today, week, total }] visitor views per venue that has any, most this week first. */
    async hitSummary({ today, weekStart }) {
      const by = new Map();
      for (const h of srcHits) {
        const x = by.get(h.slug) || { slug: h.slug, today: 0, week: 0, total: 0 };
        x.total += h.n;
        if (h.day === today) x.today += h.n;
        if (h.day >= weekStart) x.week += h.n;
        by.set(h.slug, x);
      }
      return [...by.values()].sort((a, b) => b.week - a.week || b.total - a.total || a.slug.localeCompare(b.slug));
    },
    /** → { source: visitor views since weekStart } over all venues, most first. */
    async hitSourcesBySlug({ weekStart }) {
      const by = {};
      for (const h of srcHits) if (h.day >= weekStart) (by[h.slug] ||= {})[h.source] = (by[h.slug][h.source] || 0) + h.n;
      for (const k of Object.keys(by)) by[k] = Object.fromEntries(Object.entries(by[k]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
      return by;
    },
    async hitSources({ weekStart }) {
      const by = new Map();
      for (const h of srcHits) if (h.day >= weekStart) by.set(h.source, (by.get(h.source) || 0) + h.n);
      return Object.fromEntries([...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    },

    /** Visitor views per venue, day and source since a day (YYYY-MM-DD), for the statistics page. */
    async hitRows({ since }) { return srcHits.filter((h) => h.day >= since).map((h) => ({ ...h })); },
    async addClaimEvent(slug, { day, event }) {
      let e = claimEvents.find((x) => x.slug === slug && x.day === day && x.event === event);
      if (!e) { e = { slug, day, event, n: 0 }; claimEvents.push(e); }
      e.n++;
    },
    async claimEventRows({ since }) { return claimEvents.filter((e) => e.day >= since).map((e) => ({ ...e })); },
    async addSiteEvent({ day, page, event }) {
      let e = siteEvents.find((x) => x.day === day && x.page === page && x.event === event);
      if (!e) { e = { day, page, event, n: 0 }; siteEvents.push(e); }
      e.n++;
    },
    async siteEventRows({ since }) { return siteEvents.filter((e) => e.day >= since).map((e) => ({ ...e })); },

    async recordModelCall(slug) { modelCalls.push({ slug, at: nowIso() }); },
    async countModelCalls(slug, sinceIso) {
      return modelCalls.filter((c) => c.slug === slug && (!sinceIso || c.at >= sinceIso)).length;
    },

    async listSlugs(status) {
      return [...venues.values()].filter((v) => v.status === status).map((v) => v.slug).sort();
    },
    async publicAmong(slugs) {
      return [...new Set(slugs)].filter((s) => venues.get(s)?.status === 'public').sort();
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

    async listDirectory() {
      return [...venues.values()].filter((v) => v.status === 'public')
        .map((v) => ({ slug: v.slug, name: v.facts?.name || '', street: v.facts?.address?.street || '', zip: v.facts?.address?.zip || '', city: v.facts?.address?.city || '' }));
    },
    async addRequest(slug, { role, wish, name = '', phone, channel, text = '', ipHash = '', lokal = '', project = 'namax' }) {
      if (slug != null) need(slug);
      const id = ++seq;
      requests.push({ id, slug: slug ?? null, role, wish, name, phone, channel, text, ipHash, lokal, project, at: nowIso(), doneAt: null });
      return id;
    },
    async listRequests() {
      return requests.map((r) => ({ ...r, venueName: (r.slug && venues.get(r.slug)?.facts?.name) || '' }))
        .sort(requestOrder)
        .map(({ id, slug, venueName, role, wish, name, phone, channel, text, lokal = '', project = 'namax', at, doneAt }) =>
          ({ id, slug, venueName, role, wish, name, phone, channel, text, lokal, project, at, doneAt }));
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
