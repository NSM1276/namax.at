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
      const r = await one(`select slug, key_hash, status, facts, changes, pending, confirmed_at, do_not_contact, chat_state, facade_url, chat_open, context
        from venues where slug = $1`, [slug]);
      if (!r) return null;
      return { slug: r.slug, keyHash: r.key_hash, status: r.status, facts: r.facts, changes: r.changes || {},
        pending: r.pending || null, confirmedAt: iso(r.confirmed_at), doNotContact: Boolean(r.do_not_contact), chatState: r.chat_state || {}, facadeUrl: r.facade_url || null, chatOpen: Boolean(r.chat_open), context: r.context || null };
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

    // Owner views stay in venue_hits.owner; visitor views that passed the person check go to venue_hit_sources.
    // The old venue_hits.visitors column is no longer read (it counted robots), so the count starts fresh.
    async addHit(slug, { owner, day, source = null }) {
      if (owner) {
        await query(`insert into venue_hits (slug, day, visitors, owner) values ($1, $2::date, 0, 1)
          on conflict (slug, day) do update set owner = venue_hits.owner + 1`, [slug, day]);
      } else if (source) {
        await query(`insert into venue_hit_sources (slug, day, source, n) values ($1, $2::date, $3, 1)
          on conflict (slug, day, source) do update set n = venue_hit_sources.n + 1`, [slug, day, source]);
      }
    },
    async getHits(slug, window = null) {
      const o = await one('select coalesce(sum(owner), 0) as o from venue_hits where slug = $1', [slug]);
      const r = await one(`select coalesce(sum(n), 0) as v,
        coalesce(sum(n) filter (where day = $2::date), 0) as t, coalesce(sum(n) filter (where day >= $3::date), 0) as w
        from venue_hit_sources where slug = $1`, [slug, window?.today || '1970-01-01', window?.weekStart || '1970-01-01']);
      const out = { visitors: num(r?.v || 0), owner: num(o?.o || 0) };
      return window ? { ...out, today: num(r?.t || 0), week: num(r?.w || 0) } : out;
    },
    async hitSummary({ today, weekStart }) {
      const rows = await query(`select slug, sum(n) filter (where day = $1::date) as t, sum(n) filter (where day >= $2::date) as w,
        sum(n) as total from venue_hit_sources group by slug having sum(n) > 0
        order by coalesce(sum(n) filter (where day >= $2::date), 0) desc, sum(n) desc, slug`, [today, weekStart]);
      return rows.map((r) => ({ slug: r.slug, today: num(r.t || 0), week: num(r.w || 0), total: num(r.total || 0) }));
    },
    async hitSourcesBySlug({ weekStart }) {
      const rows = await query(`select slug, source, sum(n) as n from venue_hit_sources where day >= $1::date
        group by slug, source order by slug, sum(n) desc, source`, [weekStart]);
      const by = {};
      for (const r of rows) (by[r.slug] ||= {})[r.source] = num(r.n);
      return by;
    },
    async hitSources({ weekStart }) {
      const rows = await query(`select source, sum(n) as n from venue_hit_sources where day >= $1::date
        group by source order by sum(n) desc, source`, [weekStart]);
      return Object.fromEntries(rows.map((r) => [r.source, num(r.n)]));
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
    async setContexts(entries) {
      // one statement per call: [{ slug, context }] → venues.context; unknown slugs are skipped. Returns rows updated.
      const rows = await query(`update venues as v set context = d.c from jsonb_to_recordset($1::jsonb) as d(slug text, c jsonb)
        where v.slug = d.slug returning v.slug`, [JSON.stringify(entries.map((e) => ({ slug: e.slug, c: e.context })))]);
      return rows.length;
    },
    async listForAdmin() {
      const rows = await query(`select slug, status, facts, changes, confirmed_at, owner_key_enc, facade_url, chat_open
        from venues where status <> 'removed' order by slug`);
      return rows.map((r) => ({ slug: r.slug, status: r.status, facts: r.facts, changes: r.changes || {},
        confirmedAt: iso(r.confirmed_at), ownerKeyEnc: r.owner_key_enc || null, facadeUrl: r.facade_url || null, chatOpen: Boolean(r.chat_open) }));
    },
    async setChatOpen(slug, open) { await query('update venues set chat_open = $2 where slug = $1', [slug, Boolean(open)]); },

    async listDirectory() {
      return (await query(`select slug, coalesce(facts ->> 'name', '') as name, coalesce(facts #>> '{address,street}', '') as street,
          coalesce(facts #>> '{address,zip}', '') as zip, coalesce(facts #>> '{address,city}', '') as city from venues where status = 'public'`))
        .map((r) => ({ slug: r.slug, name: r.name, street: r.street, zip: r.zip, city: r.city }));
    },
    async addRequest(slug, { role, wish, name = '', phone, channel, text = '', ipHash = '', lokal = '' }) {
      return num((await one(`insert into venue_requests (slug, role, wish, name, phone, channel, text, ip_hash, lokal)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`, [slug ?? null, role, wish, String(name), String(phone), channel, String(text), String(ipHash), String(lokal)])).id);
    },
    async listRequests() {
      const rows = await query(`select r.id, r.slug, coalesce(v.facts ->> 'name', '') as venue_name, r.role, r.wish, r.name, r.phone,
          r.channel, r.text, r.lokal, r.at, r.done_at
        from venue_requests r left join venues v on v.slug = r.slug
        order by (r.done_at is not null), (r.done_at is null and r.wish = 'website') desc, r.at desc, r.id desc`);
      return rows.map((r) => ({ id: num(r.id), slug: r.slug, venueName: r.venue_name, role: r.role, wish: r.wish, name: r.name,
        phone: r.phone, channel: r.channel, text: r.text, lokal: r.lokal || '', at: iso(r.at), doneAt: iso(r.done_at) }));
    },
    async setRequestDone(id, done) {
      await query(`update venue_requests set done_at = case when $2 then now() else null end where id = $1`, [num(id), Boolean(done)]);
    },
    async countRequestsSince(slug, since) {
      return count('select count(*) as n from venue_requests where slug = $1 and at >= $2::timestamptz', [slug, since]);
    },
    async countRequestsByIpSince(ipHash, since) {
      return count('select count(*) as n from venue_requests where ip_hash = $1 and at >= $2::timestamptz', [ipHash, since]);
    },
    async countAllRequestsSince(since) {
      return count('select count(*) as n from venue_requests where at >= $1::timestamptz', [since]);
    },
    async purgeRequests(now) {
      await query(`delete from venue_requests where (done_at is not null and done_at < $1::timestamptz - interval '90 days')
        or (done_at is null and at < $1::timestamptz - interval '180 days')`, [now]);
    },
  };
}
