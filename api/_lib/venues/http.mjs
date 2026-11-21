// Web Request → Response handlers for the venue functions. Services are passed in, so tests use fakes:
//   { store, llm, blob: { put(path, bytes, opts) → { url }, del(urls) }, ownerPart?, now? }
// The venue is always the one named by the Host header; a body can never pick another venue.
import { randomBytes } from 'node:crypto';
import { slugFromHost, renderPage } from './page.mjs';
import { isOwner, viennaDayStart, viennaDay, newKey, hashKey } from './owner.mjs';
import { chatTurn } from './assistant.mjs';
import { effectiveVenue } from './merge.mjs';
import { isAdmin, openOwnerKey, sealOwnerKey, renderAdmin, ADMIN_KEY_HASH } from './admin.mjs';

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

/** Owner record for this request, or a Response explaining why not. */
async function ownerRecord(req, store, key) {
  const slug = hostSlug(req);
  const record = slug ? await store.getVenue(slug) : null;
  if (!record) return { res: fail(404, 'not found') };
  if (!isOwner(record, typeof key === 'string' ? key : '')) return { res: fail(403, 'forbidden') };
  return { slug, record };
}

const text = (status, body, cache = 'public, s-maxage=3600') =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cache } });

export async function handlePage(req, { store, ownerPart }) {
  const url = new URL(req.url);
  if (url.pathname === '/robots.txt') {
    const slug = hostSlug(req);
    const record = slug ? await store.getVenue(slug) : null;
    if (!record || record.status !== 'public') return text(200, 'User-agent: *\nDisallow: /\n');
    return text(200, 'User-agent: *\nAllow: /\n\nSitemap: https://www.namax.at/api/venue/sitemap\n');
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
  const { slug, res } = await ownerRecord(req, store, body.k);
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
export const CLAIM_CHANNELS = ['call', 'whatsapp'];
export const DAILY_CLAIMS = 3;
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
  if (!role || !wish || !channel || !PHONE.test(phone) || phone.replace(/\D/g, '').length < 6
    || name.length > 80 || message.length > 500) return fail(400, 'bad request');
  if (await store.countRequestsSince(slug, viennaDayStart(now())) >= DAILY_CLAIMS) return fail(429, 'too many');
  await store.addRequest(slug, { role, wish, name, phone, channel, text: message });
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
  const { slug, record, res } = await ownerRecord(req, store, form.get('k'));
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

/** Counts a page view. Always 204, whatever happens, so it tells nobody anything. */
export async function handleHit(req, { store, now = () => new Date() }) {
  try {
    const slug = hostSlug(req);
    const record = slug ? await store.getVenue(slug) : null;
    if (record && record.status !== 'removed') {
      const body = (await readJson(req, 512)) || {};
      await store.addHit(slug, { owner: isOwner(record, typeof body.k === 'string' ? body.k : ''), day: viennaDay(now()) });
    }
  } catch { /* never fails visibly */ }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** Link preview picture for the venue on this host. Owner changes (name) are included; no photos are drawn. */
export async function handleOg(req, { store }) {
  const slug = hostSlug(req);
  const record = slug ? await store.getVenue(slug) : null;
  if (!record || record.status === 'removed') return text(404, 'Not found\n', 'public, s-maxage=300');
  // loaded here, not at the top: the renderer has wasm files, and the pages must never depend on them
  const { renderOg } = await import('./og.mjs');
  return renderOg(effectiveVenue(record, []));
}

/** The Overture second opinion as the list card needs it (private: Overture's phone and site are never on the public page). */
function overtureRow(o) {
  if (!o?.verdict) return null;
  const m = o.verdict === 'other' ? o.other : o.match;
  return { verdict: o.verdict, name: m?.name || null, phone: m?.phone || null, website: m?.website || null };
}

/** Nasim's private list (www.namax.at/liste?k=…). A wrong or missing key gets the same 404 as any unknown path. */
export async function handleAdmin(req, { store, adminKeyHash = ADMIN_KEY_HASH }) {
  const params = new URL(req.url).searchParams;
  const key = params.get('k') || '';
  if (!isAdmin(key, adminKeyHash)) return text(404, 'Not found\n', 'no-store');
  const records = await store.listForAdmin();
  const districtOf = (r) => Number(r.facts.internal?.district) || 0;
  const counts = new Map();
  for (const r of records) counts.set(districtOf(r), (counts.get(districtOf(r)) || 0) + 1);
  const districts = [...counts].filter(([d]) => d).sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ d, n }));
  const want = params.get('d') || '';
  const district = want === 'all' ? 'all' : districts.some((x) => String(x.d) === want) ? Number(want) : null;
  const html = (rows, opts) => new Response(renderAdmin(rows, opts), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  // No (or an unknown) district: the start page with one button per district, so the list never loads every venue at once.
  if (district == null) return html([], { districts, chooser: true });
  const rows = records.filter((r) => district === 'all' || districtOf(r) === district).map((r) => {
    const v = effectiveVenue(r, []);
    const ownerKey = r.ownerKeyEnc ? openOwnerKey(key, r.slug, r.ownerKeyEnc) : null;
    return { slug: r.slug, name: v.name, kind: v.kind, street: v.address?.street || '', district: r.facts.internal?.district || null,
      status: r.status, confirmed: Boolean(r.confirmedAt), facadeUrl: r.facadeUrl || null, ownerUrl: ownerKey ? `https://${r.slug}.namax.at/?k=${ownerKey}` : null,
      check: overtureRow(r.facts.internal?.overture) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return html(rows, { districts, district });
}

/**
 * POST www.namax.at/liste {k: admin key, slug} → a new owner key for that venue; the old owner link stops working.
 * {k, slug, status: 'public'|'hidden'} → shows or hides the page instead (the owner link stays).
 */
export async function handleAdminRotate(req, { store, adminKeyHash = ADMIN_KEY_HASH }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, 1024);
  const key = typeof body?.k === 'string' ? body.k : '';
  if (!isAdmin(key, adminKeyHash)) return fail(404, 'not found');
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const v = slug && await store.getVenue(slug);
  if (!v || v.status === 'removed') return fail(404, 'not found');
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
  const key = typeof form.get('k') === 'string' ? form.get('k') : '';
  if (!isAdmin(key, adminKeyHash)) return fail(404, 'not found');
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
  return /multipart\/form-data/i.test(req.headers.get('content-type') || '') ? handleAdminFacade(req, services) : handleAdminRotate(req, services);
}
