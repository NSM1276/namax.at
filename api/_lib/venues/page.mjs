// Answers a request for <slug>.namax.at: the public page, the owner page, or the removed notice.
import { renderVenue, ownerBar, esc } from './template.mjs';
import { effectiveVenue } from './merge.mjs';
import { isOwner } from './owner.mjs';

/** Venue slug for a host such as friseur-meidling.namax.at, or null. */
export function slugFromHost(host) {
  const name = String(host || '').toLowerCase().split(':')[0];
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.namax\.at$/.exec(name);
  return m && m[1] !== 'www' ? m[1] : null;
}

const SITE = 'https://www.namax.at';
// A visitor view; the owner page counts its own view with the key.
const HIT = `<script>try{navigator.sendBeacon('/api/venue/hit','{}')}catch(e){}</script>\n`;
const small = (title, text) => `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>body{font:18px/1.5 system-ui,sans-serif;margin:0;padding:48px 20px;background:#f1f0ec;color:#111}
main{max-width:520px;margin:0 auto}a{color:#111;display:inline-block;min-height:44px;line-height:44px}</style></head>
<body><main><h1>${esc(title)}</h1><p>${text}</p><a href="${SITE}/impressum">Impressum</a></main></body></html>`;

/**
 * { store, slug, key, ownerPart? } → { status, headers, body }.
 * ownerPart(context) → { html, css, script } is added only for the owner; defaults to the part-1 bar.
 */
export async function renderPage({ store, slug, key, ownerPart }) {
  const record = slug ? await store.getVenue(slug) : null;
  if (!record) {
    return { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=60' },
      body: small('Seite nicht gefunden', 'Diese Seite gibt es nicht.') };
  }
  if (record.status === 'removed') {
    return { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=300', 'X-Robots-Tag': 'noindex' },
      body: small('Seite gelöscht', 'Diese Seite wurde gelöscht.') };
  }
  const photos = await store.listPhotos(slug);
  const venue = effectiveVenue(record, photos);
  if (!isOwner(record, key)) {
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' },
      body: renderVenue(venue).replace('</body>', `${HIT}</body>`) };
  }
  const part = ownerPart ? await ownerPart({ store, slug, record, venue, photos }) : ownerBar();
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
    body: renderVenue(venue, { owner: part }) };
}
