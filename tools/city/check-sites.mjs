// Opens every website listed in the city dataset and records whether it really works.
// Usage: node tools/city/check-sites.mjs [city=wien]   (resumes from the city's site-checks.json, tools/city/paths.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cityPaths } from './paths.mjs';
import { fileURLToPath } from 'node:url';
import { siteKind } from './normalize.mjs';

const PARKED_HOSTS = /(^|\.)(sedo\.com|dan\.com|afternic\.com|godaddy\.com|parkingcrew\.net|bodis\.com|hugedomains\.com|uniregistry\.com|domainmarket\.com|sav\.com|nic\.at)$/;
const PARKED_TEXT = /domain (steht )?zum verkauf|this domain (is|may be) for sale|domain is parked|domain parking|diese domain (wurde|ist) (registriert|reserviert)|buy this domain|domain kaufen/i;
const PLACEHOLDER_TEXT = /coming soon|under construction|in (bearbeitung|kürze|kuerze|arbeit)|baustelle|wartungsarbeiten|maintenance mode|website (is )?launching|demnächst|demnaechst|hier entsteht|default web site page|index of \/|it works!|welcome to nginx|plesk|cpanel|^\s*wordpress\s*$/i;

/** {status, url, html} or {error} → {ok, state, detail?}; state is works | dead | parked | placeholder | social. */
export function classifySite(r) {
  if (r.error) return { ok: false, state: 'dead', detail: r.error };
  let host = '';
  try { host = new URL(r.url).hostname.toLowerCase(); } catch {}
  if (PARKED_HOSTS.test(host)) return { ok: false, state: 'parked' };
  const kind = siteKind(r.url);
  if (kind === 'social') return { ok: false, state: 'social' };
  if ([401, 403, 429].includes(r.status)) return { ok: true, state: 'works' };
  if (r.status >= 400) return { ok: false, state: 'dead', detail: `HTTP ${r.status}` };
  const html = r.html || '';
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (PARKED_TEXT.test(title) || PARKED_TEXT.test(text.slice(0, 2000))) return { ok: false, state: 'parked' };
  if (/<meta[^>]+http-equiv=["']?refresh|<i?frame[\s>]|<frameset/i.test(html)) return { ok: true, state: 'works', detail: 'redirect or frame' };
  if (PLACEHOLDER_TEXT.test(title) || (text.length < 400 && PLACEHOLDER_TEXT.test(text))) return { ok: false, state: 'placeholder' };
  if (text.length < 60 && !/<script/i.test(html)) return { ok: false, state: 'placeholder' };
  return { ok: true, state: 'works' };
}

async function probe(raw) {
  const url = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; venue-facts-pipeline/1.0)', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(15_000),
    });
    let html = '';
    if (res.body && /html|text/i.test(res.headers.get('content-type') || 'text/html')) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (html.length < 60_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }
    return { status: res.status, url: res.url, html };
  } catch (e) {
    return { error: e.cause?.code || e.name || String(e) };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const P = cityPaths(process.argv[2] || 'wien');
  const OUT = P.siteChecks;
  const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  // Network hiccups and placeholders are checked again on every run.
  const RETRY = /EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|TimeoutError|ECONNRESET|ETIMEDOUT/;
  for (const [w, r] of Object.entries(done)) if (r.state === 'placeholder' || RETRY.test(r.detail || '')) delete done[w];
  const sites = [...new Set(JSON.parse(readFileSync(P.venues, 'utf8'))
    .flatMap((v) => [v.internal.website, v.internal.overture?.match?.website]).filter((w) => w && siteKind(w) === 'own'))].filter((w) => !done[w]);
  console.log('to check', sites.length, 'already', Object.keys(done).length);
  let i = 0, n = 0;
  const save = () => writeFileSync(OUT, JSON.stringify(done, null, 1));
  const worker = async () => {
    while (i < sites.length) {
      const w = sites[i++];
      const r = await probe(w);
      done[w] = { ...classifySite(r), ...(r.status && { status: r.status }), ...(r.url && r.url !== w && { finalUrl: r.url }), checked: new Date().toISOString().slice(0, 10) };
      if (++n % 100 === 0) { save(); console.log(n, 'checked'); }
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
  save();
  const states = {};
  for (const v of Object.values(done)) states[v.state] = (states[v.state] || 0) + 1;
  console.log('done', states);
}
