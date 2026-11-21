// Web Request → Response handlers for the venue functions. Services are passed in, so tests use fakes:
//   { store, llm, blob: { put(path, bytes, opts) → { url } }, ownerPart?, now? }
// The venue is always the one named by the Host header; a body can never pick another venue.
import { randomBytes } from 'node:crypto';
import { slugFromHost, renderPage } from './page.mjs';
import { isOwner, viennaDayStart, viennaDay } from './owner.mjs';
import { chatTurn } from './assistant.mjs';
import { effectiveVenue } from './merge.mjs';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const DAILY_PHOTOS = 12;
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

export async function handleChat(req, { store, llm, now }) {
  if (req.method !== 'POST') return fail(405, 'POST only');
  const body = await readJson(req, MAX_CHAT_BODY);
  if (!body || typeof body.input !== 'object' || body.input === null) return fail(400, 'bad request');
  const { slug, res } = await ownerRecord(req, store, body.k);
  if (res) return res;
  const out = await chatTurn({ store, llm, now }, { slug, input: body.input });
  if (!out) return fail(404, 'not found');
  return json(200, out);
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
  if (await store.countPhotosSince(slug, viennaDayStart(now())) >= DAILY_PHOTOS) return fail(429, 'enough photos for today');
  const path = `venues/${slug}/${randomBytes(16).toString('hex')}.${kind.ext}`;
  const { url } = await blob.put(path, bytes, { access: 'public', contentType: kind.type, addRandomSuffix: false });
  const id = await store.addPhoto(slug, { url, kind: 'priceboard' });
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
