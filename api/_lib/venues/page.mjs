// Answers a request for <slug>.namax.at: the public page, the owner page, or the removed notice.
import { renderVenue, ownerBar, esc } from './template.mjs';
import { effectiveVenue } from './merge.mjs';
import { isOwner, visitWindow } from './owner.mjs';

/** Venue slug for a host such as friseur-meidling.namax.at, or null. */
export function slugFromHost(host) {
  const name = String(host || '').toLowerCase().split(':')[0];
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.namax\.at$/.exec(name);
  return m && m[1] !== 'www' ? m[1] : null;
}

const SITE = 'https://www.namax.at';
/**
 * Where a visitor came from, as one of a few words. Only the host of the referrer is looked at, never the path.
 * Runs in the browser too (inlined into the page script below), so it uses nothing but plain JS.
 */
export function srcOf(ref, here) {
  if (!ref) return 'direct';
  var h;
  try { h = new URL(ref).hostname.toLowerCase(); } catch (e) { return 'other'; }
  if (h === here) return 'direct';
  var is = function (d) { return h === d || h.slice(-(d.length + 1)) === '.' + d; };
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
  if (is('bing.com') || is('duckduckgo.com') || is('ecosia.org') || /(^|\.)yahoo\.[a-z.]+$/.test(h)) return 'bing';
  if (is('facebook.com') || is('instagram.com') || is('whatsapp.com') || is('t.co') || is('tiktok.com') || is('x.com') || is('linkedin.com')) return 'social';
  if (is('namax.at')) return 'namax';
  return 'other';
}

// A visitor view, counted only for a person: not for a browser driven by a program (navigator.webdriver),
// only while the page is visible, and only after the visitor touched or scrolled it (3 s in) or read it for 15 s.
// Sent once, with the source word; no cookie, nothing stored. The owner page counts its own view with the key.
const HIT = `<script>(function(){try{if(navigator.webdriver)return;var srcOf=${srcOf.toString()};
var src=srcOf(document.referrer,location.hostname),seen=0,done=0,acted=0,t0=Date.now();
function send(){if(done)return;done=1;try{navigator.sendBeacon('/api/venue/hit',JSON.stringify({src:src}))}catch(e){}}
function tick(){if(done)return;if(document.visibilityState==='visible')seen+=1;if((acted&&seen>=3)||seen>=15)send()}
['scroll','pointerdown','keydown','touchstart'].forEach(function(e){addEventListener(e,function(){acted=1;if(seen>=3)send()},{passive:true,once:true})});
setInterval(tick,1000)}catch(e){}})()</script>\n`;
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
  // Neighbours were picked when the context was built; one hidden or removed since then must not be linked or drawn.
  const near = venue.context?.near || [];
  if (near.length) {
    const live = new Set(await store.publicAmong(near.map((x) => x.slug)));
    venue.context = { ...venue.context, near: near.filter((x) => live.has(x.slug)) };
  }
  if (!isOwner(record, key)) {
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=60' },
      body: renderVenue(venue).replace('</body>', `${HIT}</body>`) };
  }
  // The chat works only where Nasim opened it after talking to the owner; elsewhere the bar leads to him.
  const seen = await store.getHits(slug, visitWindow());
  const part = ownerPart && record.chatOpen ? await ownerPart({ store, slug, record, venue, photos, seen }) : ownerBar(seen);
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
    body: renderVenue(venue, { owner: part }) };
}
