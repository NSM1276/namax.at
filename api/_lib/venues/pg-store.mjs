// The store interface of store.mjs on Postgres (schema.sql).
// pgStore(query): query(text, params) → rows.
//   Neon:   import { neon } from '@neondatabase/serverless'; const sql = neon(url); pgStore((t, p) => sql.query(t, p))
//   PGlite: pgStore((t, p) => db.query(t, p).then((r) => r.rows))   (tests)
const iso = (x) => (x == null ? null : (x instanceof Date ? x : new Date(x)).toISOString());
const num = (x) => Number(x);
const j = (x) => JSON.stringify(x ?? null);

export function pgStore(query) {
  const one = async (text, params) => (await query(text, params))[0] || null;
  const count = async (text, params) => num((await one(text, params))?.n || 0);

  return {
    async getVenue(slug) {
      const r = await one(`select slug, key_hash, status, facts, changes, pending, confirmed_at, do_not_contact, chat_state, facade_url
        from venues where slug = $1`, [slug]);
      if (!r) return null;
      return { slug: r.slug, keyHash: r.key_hash, status: r.status, facts: r.facts, changes: r.changes || {},
        pending: r.pending || null, confirmedAt: iso(r.confirmed_at), doNotContact: Boolean(r.do_not_contact), chatState: r.chat_state || {}, facadeUrl: r.facade_url || null };
    },
    async upsertFacts(slug, { facts, keyHash, status = 'hidden' }) {
      await query(`insert into venues (slug, key_hash, status, facts) values ($1, $2, $3, $4::jsonb)
        on conflict (slug) do update set facts = excluded.facts`, [slug, keyHash, status, j(facts)]);
    },
    async setPending(slug, changes) {
      const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      await query(`update venues set pending = jsonb_build_object('id', $2::bigint, 'changes', $3::jsonb,
          'createdAfterMessageId', (select coalesce(max(id), 0) from venue_messages where slug = $1))
        where slug = $1`, [slug, id, j(changes)]);
      return id;
    },
    async applyPending(slug, pendingId) {
      const r = await one(`with old as (select pending from venues where slug = $1 and pending is not null
          and ($2::bigint is null or (pending ->> 'id')::bigint = $2::bigint) for update)
        update venues v set changes = v.changes || (old.pending -> 'changes'), pending = null
        from old where v.slug = $1 returning old.pending -> 'changes' as c`, [slug, pendingId ?? null]);
      return r ? r.c : null;
    },
    async clearPending(slug) { await query('update venues set pending = null where slug = $1', [slug]); },
    async setStatus(slug, status) { await query('update venues set status = $2 where slug = $1', [slug, status]); },
    async setConfirmed(slug, at) { await query('update venues set confirmed_at = $2::timestamptz where slug = $1', [slug, at]); },
    async setDoNotContact(slug, value) { await query('update venues set do_not_contact = $2 where slug = $1', [slug, Boolean(value)]); },
    async setChatState(slug, state) { await query('update venues set chat_state = $2::jsonb where slug = $1', [slug, j(state || {})]); },

    async addMessage(slug, { role, content }) {
      return num((await one('insert into venue_messages (slug, role, content) values ($1, $2, $3) returning id', [slug, role, String(content)])).id);
    },
    async listMessages(slug, limit) {
      const rows = await query('select id, role, content, at from venue_messages where slug = $1 order by id desc limit $2', [slug, limit]);
      return rows.reverse().map((m) => ({ id: num(m.id), role: m.role, content: m.content, at: iso(m.at) }));
    },
    async countOwnerMessagesSince(slug, since) {
      return count(`select count(*) as n from venue_messages where slug = $1 and role = 'owner' and at >= $2::timestamptz`, [slug, since]);
    },

    async addPhoto(slug, { url, kind }) {
      return num((await one('insert into venue_photos (slug, url, kind) values ($1, $2, $3) returning id', [slug, url, kind])).id);
    },
    async listPhotos(slug) {
      const rows = await query('select id, url, kind, at from venue_photos where slug = $1 order by id', [slug]);
      return rows.map((p) => ({ id: num(p.id), url: p.url, kind: p.kind, at: iso(p.at) }));
    },
    async setPhotoKind(slug, id, kind) { await query('update venue_photos set kind = $3 where slug = $1 and id = $2', [slug, num(id), kind]); },
    async removePhoto(slug, id) { await query('delete from venue_photos where slug = $1 and id = $2', [slug, num(id)]); },
    async countPhotosSince(slug, since) {
      return count('select count(*) as n from venue_photos where slug = $1 and at >= $2::timestamptz', [slug, since]);
    },

    async addEvent(slug, { type, text = '' }) {
      await query('insert into venue_events (slug, type, text) values ($1, $2, $3)', [slug, type, String(text)]);
    },
    async listEvents(since) {
      const rows = await query('select slug, type, text, at from venue_events where at >= $1::timestamptz order by id', [since]);
      return rows.map((e) => ({ slug: e.slug, type: e.type, text: e.text, at: iso(e.at) }));
    },
    async countEventsSince(slug, type, since) {
      return count('select count(*) as n from venue_events where slug = $1 and type = $2 and at >= $3::timestamptz', [slug, type, since]);
    },

    async addHit(slug, { owner, day }) {
      await query(`insert into venue_hits (slug, day, visitors, owner) values ($1, $2::date, $3, $4)
        on conflict (slug, day) do update set visitors = venue_hits.visitors + excluded.visitors, owner = venue_hits.owner + excluded.owner`,
      [slug, day, owner ? 0 : 1, owner ? 1 : 0]);
    },
    async getHits(slug) {
      const r = await one('select coalesce(sum(visitors), 0) as v, coalesce(sum(owner), 0) as o from venue_hits where slug = $1', [slug]);
      return { visitors: num(r?.v || 0), owner: num(r?.o || 0) };
    },

    async recordModelCall(slug) { await query('insert into venue_model_calls (slug) values ($1)', [slug]); },
    async countModelCalls(slug, since) {
      return since
        ? count('select count(*) as n from venue_model_calls where slug = $1 and at >= $2::timestamptz', [slug, since])
        : count('select count(*) as n from venue_model_calls where slug = $1', [slug]);
    },

    async listSlugs(status) {
      return (await query('select slug from venues where status = $1 order by slug', [status])).map((r) => r.slug);
    },
    async setKeyHash(slug, hash) { await query('update venues set key_hash = $2 where slug = $1', [slug, hash]); },
    async setOwnerKeyEnc(slug, enc) { await query('update venues set owner_key_enc = $2 where slug = $1', [slug, enc]); },
    async setFacade(slug, url) { await query('update venues set facade_url = $2 where slug = $1', [slug, url || null]); },
    async listForAdmin() {
      const rows = await query(`select slug, status, facts, changes, confirmed_at, owner_key_enc, facade_url
        from venues where status <> 'removed' order by slug`);
      return rows.map((r) => ({ slug: r.slug, status: r.status, facts: r.facts, changes: r.changes || {},
        confirmedAt: iso(r.confirmed_at), ownerKeyEnc: r.owner_key_enc || null, facadeUrl: r.facade_url || null }));
    },
  };
}
