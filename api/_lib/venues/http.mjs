// Web Request → Response handlers for the venue functions. Services are passed in, so tests use fakes:
//   { store, llm, blob: { put(path, bytes, opts) → { url }, del(urls) }, ownerPart?, now? }
// The venue is always the one named by the Host header; a body can never pick another venue.
import { randomBytes, createHash } from 'node:crypto';
import { slugFromHost, renderPage } from './page.mjs';
import { isOwner, viennaDayStart, viennaDay, visitWindow, newKey, hashKey } from './owner.mjs';
import { chatTurn } from './assistant.mjs';
import { effectiveVenue } from './merge.mjs';
import { isAdmin, openOwnerKey, sealOwnerKey, renderAdmin, ADMIN_KEY_HASH } from './admin.mjs';
import { CITIES, CITY_ORDER, cityOf, districtLabel } from './cities.mjs';
import { renderStats } from './stats.mjs';
import { faviconSvg } from './around.mjs';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const DAILY_PHOTOS = 12;
/** Free pages keep at most this many photos: the next upload replaces the oldest, so storage never grows. */
export const MAX_STORED_PHOTOS = 4;
/** The facade photo arrives already cropped and shrunk on the phone (about 250 KB); this is only the ceiling. */
export const MAX_FACADE_BYTES = 3 * 1024 * 1024;
const MAX_CHAT_BODY = 8 * 1024;

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
const fail = (status, error) => json(status, { error });
const hostSlug = (req) => slugFromHost(req.headers.get('host') || new URL(req.url).host);

async function readJson(req, limit) {
  const text = await req.text();
  if (text.length > limit) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/** Owner record for this request, or a Response explaining why not. Chat and photo upload need the chat opened by Nasim. */
async function ownerRecord(req, store, key, { needChat = false } = {}) {
  const slug = hostSlug(req);
  const record = slug ? await store.getVenue(slug) : null;
  if (!record) return { res: fail(404, 'not found') };
  if (!isOwner(record, typeof key === 'string' ? key : '')) return { res: fail(403, 'forbidden') };
  if (needChat && !record.chatOpen) return { res: fail(404, 'not found') };
  return { slug, record };
}

const text = (status, body, cache = 'public, s-maxage=3600') =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cache } });

// Crawlers that only collect data for AI training or SEO tools: no visitors for the venue, only billed requests (Nasim, 2026-11-24).
// AI search and assistants (OAI-SearchBot, ChatGPT-User, PerplexityBot) stay allowed: they can send people to the venue.
export const NO_CRAWL_BOTS = ['GPTBot', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'meta-externalagent',
  'Amazonbot', 'cohere-ai', 'Diffbot', 'omgili', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'BLEXBot', 'DataForSeoBot'];
const NO_CRAWL = NO_CRAWL_BOTS.map((b) => `User-agent: ${b}`).join('\n') + '\nDisallow: /\n';

export async function handlePage(req, { store, ownerPart }) {
  const url = new URL(req.url);
  if (url.pathname === '/robots.txt') {
    const slug = hostSlug(req);
    const record = slug ? await store.getVenue(slug) : null;
    if (!record || record.status !== 'public') return text(200, 'User-agent: *\nDisallow: /\n');
    return text(200, `${NO_CRAWL}\nUser-agent: *\nAllow: /\n\nSitemap: https://www.namax.at/api/venue/sitemap\n`);
  }
  if (url.pathname === '/favicon.svg') {
    const slug = hostSlug(req);
    const record = slug ? await store.getVenue(slug) : null;
    if (!record || record.status === 'removed') return text(404, 'Not found\n', 'public, s-maxage=600');
    return new Response(faviconSvg(effectiveVenue(record)), {
      status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } });
  }
  // '/' as the visitor asked; '/api/venue/page' if the platform passes the rewritten path
  if (url.pathname !== '/' && url.pathname !== '/api/venue/page') return text(404, 'Not found\n', 'public, s-maxage=600');
  const page = await renderPage({ store, slug: hostSlug(req), key: url.searchParams.get('k') || '', ownerPart });
  return new Response(page.body, { status: page.status, headers: page.headers });
}

/** Deletes the given photos from the store and their files from Blob. A failed file delete never blocks the owner. */
async function dropPhotos(store, blob, slug, photos) {
  if (!photos.length) return;
  for (const p of photos) await store.removePhoto(slug, p.id);
  try { await blob.del(photos.map((p) => p.url)); } catch (e) { console.error('blob del failed', slug, e?.message); }
}

async function dropFacade(store, blob, slug, url) {
  await store.setFacade(slug, null);
  try { await blob.del([url]); } catch (e) { console.error('blob del failed', slug, e?.message); }
}

export async function handleChat(req, { store, llm, blob, now }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, MAX_CHAT_BODY);
  if (!body || typeof body.input !== 'object' || body.input === null) return fail(400, 'bad request');
  const { slug, res } = await ownerRecord(req, store, body.k, { needChat: true });
  if (res) return res;
  const out = await chatTurn({ store, llm, now }, { slug, input: body.input });
  if (!out) return fail(404, 'not found');
  const after = blob && await store.getVenue(slug);
  if (after && after.status === 'removed') {
    await dropPhotos(store, blob, slug, await store.listPhotos(slug));
    if (after.facadeUrl) await dropFacade(store, blob, slug, after.facadeUrl);
  }
  return json(200, out);
}

export const CLAIM_ROLES = ['owner', 'staff', 'other'];
export const CLAIM_WISHES = ['fix', 'photos', 'website', 'remove'];
export const CLAIM_CHANNELS = ['call', 'whatsapp'];  // 'none' is stored for visitor reports only
export const DAILY_CLAIMS = 3; // per venue
export const DAILY_CLAIMS_PER_SENDER = 5;
export const DAILY_CLAIMS_TOTAL = 200;
const MAX_CLAIM_BODY = 4 * 1024;
const PHONE = /^\+?[0-9 ()/-]{6,20}$/;
const pick = (v, list) => (typeof v === 'string' && list.includes(v) ? v : null);

/** "Sind Sie der Inhaber?" form: the owner writes first and agrees to be contacted on the number they typed.
 *  The venue is the one of the Host header. A filled honeypot ("website") gets 200 and is dropped. */
export async function handleClaim(req, { store, now = () => new Date() }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, MAX_CLAIM_BODY);
  if (!body) return fail(400, 'bad request');
  const slug = hostSlug(req);
  const record = slug ? await store.getVenue(slug) : null;
  if (!record || record.status === 'removed') return fail(404, 'not found');
  if (typeof body.website === 'string' && body.website.trim()) return json(200, { ok: true });
  const role = pick(body.role, CLAIM_ROLES), wish = pick(body.wish, CLAIM_WISHES), channel = pick(body.channel, CLAIM_CHANNELS);
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const message = typeof body.text === 'string' ? body.text.trim() : '';
  // A visitor telling us the details are wrong needs no way back: the message is what counts, the number is optional.
  const report = role === 'other' && wish === 'fix';
  const phoneOk = PHONE.test(phone) && phone.replace(/\D/g, '').length >= 6;
  if (!role || !wish || name.length > 80 || message.length > 500) return fail(400, 'bad request');
  if (report ? (message.length < 3 || (phone && !phoneOk)) : (!channel || !phoneOk)) return fail(400, 'bad request');
  const day = viennaDayStart(now());
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = ip ? createHash('sha256').update('namax claim v1:' + ip).digest('hex').slice(0, 16) : '';
  if (await store.countRequestsSince(slug, day) >= DAILY_CLAIMS
    || (ipHash && await store.countRequestsByIpSince(ipHash, day) >= DAILY_CLAIMS_PER_SENDER)
    || await store.countAllRequestsSince(day) >= DAILY_CLAIMS_TOTAL) return fail(429, 'too many');
  await store.addRequest(slug, { role, wish, name, phone, channel: channel || 'none', text: message, ipHash });
  try { await store.addClaimEvent(slug, { day: viennaDay(now()), event: 'sent' }); } catch { /* the request counts, the statistic may miss it */ }
  return json(200, { ok: true });
}

/** Image type from the first bytes, or null. The browser's claimed type is not trusted. */
function sniff(bytes) {
  const b = bytes.subarray(0, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

export async function handlePhoto(req, { store, blob, now = () => new Date() }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const length = Number(req.headers.get('content-length') || 0);
  if (length > MAX_PHOTO_BYTES + 64 * 1024) return fail(413, 'too large');
  let form;
  try { form = await req.formData(); } catch { return fail(400, 'bad request'); }
  const { slug, record, res } = await ownerRecord(req, store, form.get('k'), { needChat: true });
  if (res) return res;
  if (record.status === 'removed') return fail(410, 'removed');
  const file = form.get('photo');
  if (!file || typeof file.arrayBuffer !== 'function') return fail(400, 'no photo');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return fail(415, 'jpeg, png or webp only');
  if (file.size > MAX_PHOTO_BYTES) return fail(413, 'too large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return fail(415, 'jpeg, png or webp only');
  // Uploads are counted as events, because replaced photos leave the photo table.
  if (await store.countEventsSince(slug, 'photo', viennaDayStart(now())) >= DAILY_PHOTOS) return fail(429, 'enough photos for today');
  const path = `venues/${slug}/${randomBytes(16).toString('hex')}.${kind.ext}`;
  const { url } = await blob.put(path, bytes, { access: 'public', contentType: kind.type, addRandomSuffix: false });
  const id = await store.addPhoto(slug, { url, kind: 'priceboard' });
  await store.addEvent(slug, { type: 'photo', text: url });
  const all = await store.listPhotos(slug);
  await dropPhotos(store, blob, slug, all.slice(0, Math.max(0, all.length - MAX_STORED_PHOTOS)));
  return json(200, { id });
}

/** XML sitemap of the public venue pages, served on www.namax.at. */
export async function handleSitemap(req, { store }) {
  const slugs = await store.listSlugs('public');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + slugs.map((s) => `<url><loc>https://${s}.namax.at/</loc></url>`).join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' } });
}

// Crawlers that run the page script (Google renders pages) are not visitors.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python|curl|wget/i;

// The words the page script may send as the visitor's source (page.mjs srcOf); anything else is "other".
export const HIT_SOURCES = ['google', 'bing', 'social', 'namax', 'direct', 'other'];
// What the owner form may report about itself (template.mjs CLAIM_SCRIPT): which button opened it, the step reached,
// the role and wish picked, the step it was closed at, an error shown. Counts only; "sent" is counted by handleClaim.
export const CLAIM_EVENTS = ['open:niche', 'open:nophoto', 'open:link', 'open:report', 'step:2', 'step:3',
  ...CLAIM_ROLES.map((r) => 'role:' + r), ...CLAIM_WISHES.map((w) => 'wish:' + w), 'close:1', 'close:2', 'close:3', 'fail'];
// Set by the admin page on Nasim's own devices: his views of the venue pages are not visits.
export const STAFF_COOKIE = 'nx_staff';
const STAFF_MARK = `${STAFF_COOKIE}=1; Domain=namax.at; Path=/; Max-Age=31536000; Secure; SameSite=Lax`;
const isStaff = (req) => (req.headers.get('cookie') || '').split(';').some((p) => p.trim() === `${STAFF_COOKIE}=1`);

/** Counts a page view. Always 204, whatever happens, so it tells nobody anything. */
export async function handleHit(req, { store, now = () => new Date() }) {
  try {
    if (BOT_UA.test(req.headers.get('user-agent') || '') || isStaff(req)) throw 0;
    const slug = hostSlug(req);
    const record = slug ? await store.getVenue(slug) : null;
    if (record && record.status !== 'removed') {
      const body = (await readJson(req, 512)) || {};
      // A form event instead of a view: only the known words, nothing else from the body is kept.
      if (body.ev !== undefined) {
        if (typeof body.ev === 'string' && CLAIM_EVENTS.includes(body.ev)) await store.addClaimEvent(slug, { day: viennaDay(now()), event: body.ev });
        throw 0;
      }
      const owner = isOwner(record, typeof body.k === 'string' ? body.k : '');
      // A visitor view carries the source word of the person check (page.mjs); the old bare beacon has none and is not counted.
      const source = owner || typeof body.src !== 'string' ? null : HIT_SOURCES.includes(body.src) ? body.src : 'other';
      await store.addHit(slug, { owner, day: viennaDay(now()), source });
    }
  } catch { /* never fails visibly */ }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** Link preview picture for the venue on this host. Owner changes (name) are included; no photos are drawn. */
const ICON_PATHS = { '/favicon.ico': 'ico', '/favicon.png': 'png', '/apple-touch-icon.png': 'apple' };

export async function handleOg(req, { store }) {
  const url = new URL(req.url);
  const slug = hostSlug(req);
  const record = slug ? await store.getVenue(slug) : null;
  if (!record || record.status === 'removed') return text(404, 'Not found\n', 'public, s-maxage=300');
  // loaded here, not at the top: the renderer has wasm files, and the pages must never depend on them
  const { renderOg, renderIcon } = await import('./og.mjs');
  // the middleware sends /favicon.ico etc. here with ?icon=…; the visitor's own path is checked too
  const icon = url.searchParams.get('icon') || ICON_PATHS[url.pathname];
  if (icon) return renderIcon(effectiveVenue(record), icon) || text(404, 'Not found\n', 'public, s-maxage=600');
  // the page shows the niche picture only without owner photos; the preview follows the page
  return renderOg(effectiveVenue(record, await store.listPhotos(slug)));
}

/** The Overture second opinion as the list card needs it (private: Overture's phone and site are never on the public page). */
function overtureRow(o) {
  if (!o?.verdict) return null;
  const m = o.verdict === 'other' ? o.other : o.match;
  return { verdict: o.verdict, name: m?.name || null, phone: m?.phone || null, website: m?.website || null };
}

// The list remembers Nasim with a cookie that only www.namax.at receives (no Domain attribute, so venue pages never see it).
const ADMIN_COOKIE = 'namax_admin';
const cookieKey = (req) => {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ADMIN_COOKIE) return rest.join('=');
  }
  return '';
};
/** The admin key of a request: the one sent along (body or URL), else the cookie; null when neither is right. */
function adminKey(req, sent, adminKeyHash) {
  if (typeof sent === 'string' && isAdmin(sent, adminKeyHash)) return sent;
  const c = cookieKey(req);
  return isAdmin(c, adminKeyHash) ? c : null;
}

/**
 * Nasim's private list (www.namax.at/liste). /liste?k=KEY logs in: cookie + redirect to the same address without the key.
 * A wrong or missing key gets the same 404 as any unknown path.
 */
export async function handleAdmin(req, { store, adminKeyHash = ADMIN_KEY_HASH, now = () => new Date() }) {
  const url = new URL(req.url);
  const params = url.searchParams;
  if (params.has('k')) {
    const k = params.get('k') || '';
    if (!isAdmin(k, adminKeyHash)) return text(404, 'Not found\n', 'no-store');
    params.delete('k');
    // Always /liste: behind the vercel.json rewrite the function may see its own path (/api/venue/admin).
    const h = new Headers({ Location: '/liste' + (params.size ? '?' + params : ''), 'Cache-Control': 'no-store' });
    h.append('Set-Cookie', `${ADMIN_COOKIE}=${k}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
    h.append('Set-Cookie', STAFF_MARK);
    return new Response(null, { status: 303, headers: h });
  }
  const key = adminKey(req, null, adminKeyHash);
  if (!key) return text(404, 'Not found\n', 'no-store');
  if (params.get('view') === 'stats') return handleStats(store, now());
  await store.purgeRequests(now().toISOString());
  const all = await store.listForAdmin();
  // One city at a time (?c=graz; none = Wien, so ?d= alone is a Vienna district as before), then one district of it.
  const perCity = new Map();
  for (const r of all) perCity.set(cityOf(r.facts), (perCity.get(cityOf(r.facts)) || 0) + 1);
  const cities = CITY_ORDER.filter((c) => c === 'wien' || perCity.has(c)).map((c) => ({ c, name: CITIES[c].name, n: perCity.get(c) || 0 }));
  const city = cities.some((x) => x.c === params.get('c')) ? params.get('c') : 'wien';
  const records = all.filter((r) => cityOf(r.facts) === city);
  const districtOf = (r) => Number(r.facts.internal?.district) || 0;
  const counts = new Map();
  for (const r of records) counts.set(districtOf(r), (counts.get(districtOf(r)) || 0) + 1);
  const districts = [...counts].filter(([d]) => d).sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ d, n }));
  const want = params.get('d') || '';
  const district = want === 'all' ? 'all' : districts.some((x) => String(x.d) === want) ? Number(want) : null;
  const html = (rows, opts) => new Response(renderAdmin(rows, opts), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Set-Cookie': STAFF_MARK } });
  const live = new Map(all.map((r) => [r.slug, { chatOpen: r.chatOpen, name: effectiveVenue(r, []).name }]));
  const bySlug = new Map(all.map((r) => [r.slug, r]));
  // The owner link goes into "Chat + Link senden"; the page phone shows whether the typed number is the venue's own.
  const extra = (slug) => {
    const r = slug && bySlug.get(slug);
    if (!r) return { ownerUrl: null, pagePhone: null };
    const ownerKey = r.ownerKeyEnc ? openOwnerKey(key, r.slug, r.ownerKeyEnc) : null;
    return { ownerUrl: ownerKey ? `https://${r.slug}.namax.at/?k=${ownerKey}` : null, pagePhone: effectiveVenue(r, []).phone || null };
  };
  const requests = (await store.listRequests()).map((q) => ({ ...q, venueName: live.get(q.slug)?.name || q.venueName, chatOpen: live.get(q.slug)?.chatOpen ?? null, ...extra(q.slug) }));
  const openRequests = requests.filter((q) => !q.doneAt).length;
  const hitRows = await store.hitSummary(visitWindow(now()));
  const sources = await store.hitSources(visitWindow(now()));
  const visits = { ...hitRows.reduce((a, h) => ({ today: a.today + h.today, week: a.week + h.week, total: a.total + h.total }), { today: 0, week: 0, total: 0 }), sources };
  const hitBy = new Map(hitRows.map((h) => [h.slug, h]));
  // No district: plain /liste is the "Anfragen" start page; ?v=lokale (or an unknown district) the district chooser,
  // so the list never loads every venue at once.
  if (district == null) {
    const view = want || params.get('v') === 'lokale' ? 'lokale' : 'anfragen';
    const bySlug = await store.hitSourcesBySlug(visitWindow(now()));
    const top = hitRows.slice(0, 20).map((h) => ({ ...h, name: live.get(h.slug)?.name, sources: bySlug[h.slug] || {} }));
    return html([], { districts, chooser: true, requests, view, visits, top, cities, city });
  }
  const rows = records.filter((r) => district === 'all' || districtOf(r) === district).map((r) => {
    const v = effectiveVenue(r, []);
    const ownerKey = r.ownerKeyEnc ? openOwnerKey(key, r.slug, r.ownerKeyEnc) : null;
    return { slug: r.slug, name: v.name, kind: v.kind, street: v.address?.street || '', district: r.facts.internal?.district || null,
      status: r.status, confirmed: Boolean(r.confirmedAt), facadeUrl: r.facadeUrl || null, ownerUrl: ownerKey ? `https://${r.slug}.namax.at/?k=${ownerKey}` : null,
      check: overtureRow(r.facts.internal?.overture), chatOpen: Boolean(r.chatOpen), visits: hitBy.get(r.slug) || null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return html(rows, { districts, district, openRequests, visits, cities, city });
}

export const STATS_DAYS = 60; // 30 days shown, the 30 before them for the trend

/** www.namax.at/liste/statistik: visits and the owner form, all drawn in the browser from these counts. */
async function handleStats(store, now) {
  const today = viennaDay(now);
  const start = new Date(today + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (STATS_DAYS - 1));
  const since = start.toISOString().slice(0, 10);
  const [hits, claims, all, requests] = await Promise.all([store.hitRows({ since }), store.claimEventRows({ since }), store.listForAdmin(), store.listRequests()]);
  const seen = new Set([...hits, ...claims].map((r) => r.slug));
  const venues = {};
  for (const r of all) {
    if (!seen.has(r.slug)) continue;
    const city = cityOf(r.facts), d = Number(r.facts.internal?.district) || 0;
    venues[r.slug] = [effectiveVenue(r, []).name, city, d ? districtLabel(city, d) : '', r.facts.kind || ''];
  }
  const cities = CITY_ORDER.map((c) => [c, CITIES[c].name]);
  return new Response(renderStats({ today, days: STATS_DAYS, hits, claims, venues, cities, openRequests: requests.filter((q) => !q.doneAt).length }), { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Set-Cookie': STAFF_MARK } });
}

/**
 * POST www.namax.at/liste {k: admin key, slug} → a new owner key for that venue; the old owner link stops working.
 * {k, slug, status: 'public'|'hidden'} → shows or hides the page instead (the owner link stays).
 * {k, slug, chatOpen: bool} → opens or closes the owner chat for that venue.  {k, requestId, done: bool} → request done / open again.
 * The key may come from the cookie instead of the body.
 */
export async function handleAdminRotate(req, { store, adminKeyHash = ADMIN_KEY_HASH }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, 1024);
  const key = adminKey(req, body?.k, adminKeyHash);
  if (!key) return fail(404, 'not found');
  if (!body) return fail(400, 'bad request');
  if (body.requestId !== undefined) {
    if (!Number.isInteger(body.requestId) || typeof body.done !== 'boolean') return fail(400, 'bad request');
    await store.setRequestDone(body.requestId, body.done);
    return json(200, { done: body.done });
  }
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const v = slug && await store.getVenue(slug);
  if (!v || v.status === 'removed') return fail(404, 'not found');
  if (body.chatOpen !== undefined) {
    if (typeof body.chatOpen !== 'boolean') return fail(400, 'bad request');
    await store.setChatOpen(slug, body.chatOpen);
    return json(200, { chatOpen: body.chatOpen });
  }
  if (body.status !== undefined) {
    if (body.status !== 'public' && body.status !== 'hidden') return fail(400, 'status must be public or hidden');
    await store.setStatus(slug, body.status);
    return json(200, { status: body.status });
  }
  const ownerKey = newKey();
  await store.setKeyHash(slug, hashKey(ownerKey));
  await store.setOwnerKeyEnc(slug, sealOwnerKey(key, slug, ownerKey));
  return json(200, { ownerUrl: `https://${slug}.namax.at/?k=${ownerKey}` });
}

/** POST www.namax.at/liste, multipart {k, slug, photo} or {k, slug, delete=1} → the venue's facade photo. */
export async function handleAdminFacade(req, { store, blob, adminKeyHash = ADMIN_KEY_HASH }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (Number(req.headers.get('content-length') || 0) > MAX_FACADE_BYTES + 64 * 1024) return fail(413, 'too large');
  let form;
  try { form = await req.formData(); } catch { return fail(400, 'bad request'); }
  const key = adminKey(req, form.get('k'), adminKeyHash);
  if (!key) return fail(404, 'not found');
  const slug = typeof form.get('slug') === 'string' ? form.get('slug') : '';
  const v = slug && await store.getVenue(slug);
  if (!v || v.status === 'removed') return fail(404, 'not found');
  if (form.get('delete') === '1') {
    if (v.facadeUrl) await dropFacade(store, blob, slug, v.facadeUrl);
    return json(200, { url: null });
  }
  const file = form.get('photo');
  if (!file || typeof file.arrayBuffer !== 'function') return fail(400, 'no photo');
  if (file.size > MAX_FACADE_BYTES) return fail(413, 'too large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return fail(415, 'jpeg, png or webp only');
  const path = `venues/${slug}/facade-${randomBytes(16).toString('hex')}.${kind.ext}`;
  const { url } = await blob.put(path, bytes, { access: 'public', contentType: kind.type, addRandomSuffix: false });
  await store.setFacade(slug, url);
  if (v.facadeUrl) { try { await blob.del([v.facadeUrl]); } catch (e) { console.error('blob del failed', slug, e?.message); } }
  return json(200, { url });
}

/** Every POST to the private list: a photo upload comes as multipart, a new owner link as JSON. */
export function handleAdminPost(req, services) {
  // The cookie alone authorizes, so a page on another origin (any <slug>.namax.at is same-site) must not post here.
  const origin = req.headers.get('origin');
  let originHost = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { originHost = '?'; }
  if (originHost && originHost !== (req.headers.get('host') || new URL(req.url).host)) return Promise.resolve(fail(403, 'forbidden'));
  return /multipart\/form-data/i.test(req.headers.get('content-type') || '') ? handleAdminFacade(req, services) : handleAdminRotate(req, services);
}

// ── namax.at/kostenlos ───────────────────────────────────────────────────────
// The owner finds the venue among the public pages and leaves a number. Search shows only public pages,
// and a request from the main site can name only a public venue (or a new one, by name and address).

export const SEARCH_LIMIT = 8;
const DIRECTORY_TTL = 5 * 60 * 1000;
let directoryCache = { store: null, at: 0, list: [] };
/** Lowercase, no accents, ß → ss, only letters and digits separated by single spaces. */
export const fold = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

async function directoryOf(store, now) {
  if (directoryCache.store !== store || now - directoryCache.at > DIRECTORY_TTL) {
    const list = (await store.listDirectory()).map((v) => ({ ...v, key: fold(v.name), all: fold(`${v.name} ${v.street} ${v.zip}`) }));
    directoryCache = { store, at: now, list };
  }
  return directoryCache.list;
}

/** GET /api/venue/search?q= → { results: [{ slug, name, place }] }, best first: name starts with the query,
 *  then a word of the name does, then the query is somewhere in name, street or postcode; ties alphabetical. */
export async function handleSearch(req, { store, now = () => new Date() }) {
  const q = fold(new URL(req.url).searchParams.get('q'));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Robots-Tag': 'noindex' };
  if (q.length < 2 || q.length > 60) return new Response(JSON.stringify({ results: [] }), { status: 200, headers });
  const words = q.split(' ');
  const rank = (v) => v.key.startsWith(q) ? 0 : (' ' + v.key).includes(' ' + q) ? 1 : 2;
  const hits = (await directoryOf(store, now().getTime()))
    .filter((v) => words.every((w) => v.all.includes(w)))
    .sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))
    .slice(0, SEARCH_LIMIT)
    .map((v) => ({ slug: v.slug, name: v.name, place: [v.street, [v.zip, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') }));
  return new Response(JSON.stringify({ results: hits }), { status: 200, headers });
}

export const SIGNUP_ROLES = ['owner', 'staff'];
export const SIGNUP_WISHES = ['manage', 'fix', 'photos', 'website'];  // 'manage' only here: the venue form has its own title for it

/** POST /api/venue/signup { slug | lokal, role, wish, name, phone, channel, website } from namax.at/kostenlos.
 *  Same rules as the venue form: the owner writes first, a number is required, honeypot and daily limits. */
export async function handleSignup(req, { store, now = () => new Date() }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, MAX_CLAIM_BODY);
  if (!body) return fail(400, 'bad request');
  if (typeof body.website === 'string' && body.website.trim()) return json(200, { ok: true });
  const role = pick(body.role, SIGNUP_ROLES), wish = pick(body.wish, SIGNUP_WISHES), channel = pick(body.channel, CLAIM_CHANNELS);
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const lokal = typeof body.lokal === 'string' ? body.lokal.trim().replace(/\s+/g, ' ') : '';
  const slug = typeof body.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(body.slug) ? body.slug : null;
  if (!role || !wish || !channel || name.length > 80 || !PHONE.test(phone) || phone.replace(/\D/g, '').length < 6) return fail(400, 'bad request');
  if (slug) {
    const record = await store.getVenue(slug);
    if (!record || record.status !== 'public') return fail(404, 'not found');
  } else if (lokal.length < 3 || lokal.length > 160) return fail(400, 'bad request');
  const day = viennaDayStart(now());
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = ip ? createHash('sha256').update('namax claim v1:' + ip).digest('hex').slice(0, 16) : '';
  if ((slug && await store.countRequestsSince(slug, day) >= DAILY_CLAIMS)
    || (ipHash && await store.countRequestsByIpSince(ipHash, day) >= DAILY_CLAIMS_PER_SENDER)
    || await store.countAllRequestsSince(day) >= DAILY_CLAIMS_TOTAL) return fail(429, 'too many');
  await store.addRequest(slug, { role, wish, name, phone, channel, text: '', ipHash, lokal: slug ? '' : lokal });
  return json(200, { ok: true });
}
