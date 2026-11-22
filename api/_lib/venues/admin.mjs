// Nasim's private list of all venue pages: www.namax.at/liste?k=<admin key>.
// The admin key itself is never stored: the code keeps its SHA-256, the key lives in Nasim's bookmark and in .env.local.
// Owner keys are sealed with AES-256-GCM under a key derived from the admin key, bound to the venue slug,
// so the database alone does not reveal any owner link.
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { esc } from './template.mjs';
import { T } from './i18n.mjs';
import { normalizePhone } from './phone.mjs';
import { CITIES, districtLabel } from './cities.mjs';

export const ADMIN_KEY_HASH = 'a28eb7d5cdee0e94cd6f950753cbd6614a7ef3425cd1e825708706bc072cc6e9';

const sha256 = (s) => createHash('sha256').update(String(s)).digest();
const sealKey = (adminKey) => sha256('namax owner keys v1:' + adminKey);

export function isAdmin(key, hashHex = ADMIN_KEY_HASH) {
  if (typeof key !== 'string' || !/^[0-9a-f]{32}$/.test(key) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  return timingSafeEqual(sha256(key), Buffer.from(hashHex, 'hex'));
}

/** → base64url(iv | tag | ciphertext); the slug is authenticated, so a sealed key cannot be moved to another venue. */
export function sealOwnerKey(adminKey, slug, ownerKey) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', sealKey(adminKey), iv);
  c.setAAD(Buffer.from(slug));
  const ct = Buffer.concat([c.update(ownerKey, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

/** → owner key, or null when the admin key, the slug or the data do not match. */
export function openOwnerKey(adminKey, slug, enc) {
  try {
    const b = Buffer.from(String(enc), 'base64url');
    if (b.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', sealKey(adminKey), b.subarray(0, 12));
    d.setAAD(Buffer.from(slug));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

const KIND_DE = { friseur: 'Friseur', cafe: 'Café', restaurant: 'Restaurant', imbiss: 'Imbiss', handy: 'Handyreparatur',
  kosmetik: 'Kosmetik', nails: 'Nagelstudio', schneider: 'Schneiderei' };
const kindDe = (k) => KIND_DE[k] || k;

/** Facade thumbnail address: our Blob store, or the local preview's in-memory store. */
const thumbSrc = (u) => (typeof u !== 'string' ? ''
  : /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/venues\/[\w./-]+$/.test(u) ? u
  : /^__blob\/venues\/[\w./-]+$/.test(u) ? '/' + u : '');

export const DISTRICT_NAMES = CITIES.wien.districts;

// The admin key travels in an HttpOnly cookie (set by /liste?k=…); nothing in the page knows it.
// The city stays in the address (?c=graz); Vienna has none, so old ?d= bookmarks keep working.
const NAV_JS = `function keep(d){try{localStorage.setItem('namax-liste-d',d);localStorage.setItem('namax-liste-c',new URLSearchParams(location.search).get('c')||'')}catch(e){}}
function go(d){keep(d);var q=new URLSearchParams(location.search);q.set('d',d);location.search=q.toString()}`;
const cityQuery = (city) => (city && city !== 'wien' ? `&c=${city}` : '');
// City row above the districts, only once there is more than one city.
const CITIES_CSS = `.cities{display:flex;gap:6px;flex-wrap:wrap;max-width:760px;margin:0 auto;padding:12px 12px 0}
.cities a{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:8px 12px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#111;text-decoration:none;font-weight:600}
.cities a[aria-current]{background:#111;color:#fff;border-color:#111}.cities span{font-weight:400;opacity:.7}`;
function cityNav(cities, city) {
  if (!cities || cities.length < 2) return '';
  return '<nav class="cities" aria-label="Stadt">' + cities.map((c) => `<a href="/liste?v=lokale${esc(cityQuery(c.c))}"${c.c === city ? ' aria-current="page"' : ''}>${esc(c.name)} <span>${c.n}</span></a>`).join('') + '</nav>';
}

// Two tabs on every page: "Anfragen" (start page) and "Lokale" (districts and cards).
const TABS_CSS = `.tabs{display:flex;gap:6px;margin-top:10px}.tabs a{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px;border-radius:8px;background:#2a2a2a;color:#fff;text-decoration:none;font-weight:600}
.tabs a[aria-current]{background:#ffc93c;color:#111}.tabs span{display:inline-block;min-width:24px;padding:0 7px;border-radius:999px;background:#fff;color:#111;text-align:center;font-size:14px}`;
function tabsNav(active, openCount) {
  const cur = (t) => (t === active ? ' aria-current="page"' : '');
  return `<nav class="tabs" aria-label="Bereich"><a href="/liste"${cur('anfragen')}>Anfragen <span>${Number(openCount) || 0}</span></a>`
    + `<a href="/liste?v=lokale" data-lokale${cur('lokale')}>Lokale</a></nav>`;
}
// Visit counter line, on every page under the title: visitor views of all venue pages (owner views excluded).
const VIS_CSS = '.vis{margin:6px 0 0;font-size:14px;color:#ddd}.vis b{color:#fff}';
const visLine = (v) => (v ? `<p class="vis">Besuche · heute <b>${v.today}</b> · 7 Tage <b>${v.week}</b> · gesamt <b>${v.total}</b></p>` : '');
// The "Lokale" tab reopens the last district used on this device.
const TABS_JS = `var t=document.querySelector('[data-lokale]'),l='',lc='';try{l=(localStorage.getItem('namax-liste-d')||'').replace(/[^0-9a-z]/g,'');lc=(localStorage.getItem('namax-liste-c')||'').replace(/[^a-z]/g,'')}catch(e){}if(t&&l)t.href='/liste?'+(lc&&lc!=='wien'?'c='+lc+'&':'')+'d='+l;`;

const CL = T.claim.de;
const MAX_SHOWN_REQUESTS = 50; // a flood never makes the start page unusable
const CHANNEL_DE = { call: 'Anruf', whatsapp: 'WhatsApp' };
const viennaTime = (iso) => new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  .format(new Date(iso)).replace(',', '');
/** Digits for tel:/wa.me: the number the owner typed, as +43…; null when it cannot be read. */
const dialable = (raw) => normalizePhone(String(raw || ''));
function chatButton(slug, open) {
  return open
    ? `<button type="button" data-chat="${esc(slug)}" data-to="0" class="rot">Chat sperren</button>`
    : `<button type="button" data-chat="${esc(slug)}" data-to="1">Chat freischalten</button>`;
}

/** One request card: what the owner chose, and the way back to them that they chose, on the number they typed. */
// First line of every message to a requester: name and venue, so they know at once who writes.
export function greeting(q) {
  const venue = q.slug ? (q.venueName || q.slug) : (q.lokal || '').split(',')[0].trim();  // new venue: name without the address
  return `Hallo${q.name ? ' ' + q.name : ''}, hier ist Nasim von namax.` + (venue ? ` Danke für Ihre Anfrage zu ${venue}.` : '');
}
const waLink = (tel, text) => `https://wa.me/${tel.slice(1)}?text=${encodeURIComponent(text)}`;

function requestCard(q) {
  const tel = dialable(q.phone);
  const hi = greeting(q);
  const wa = tel && `<a${q.channel === 'whatsapp' ? ' class="pg"' : ''} href="${esc(waLink(tel, hi))}" target="_blank" rel="noopener">WhatsApp</a>`;
  const main = !q.phone ? '<span class="no">ohne Nummer</span>' : !tel ? '<span class="no">Nummer unlesbar</span>'
    : q.channel === 'whatsapp' ? wa : `<a class="pg" href="tel:${tel}">Anrufen</a>${wa}`;
  // One tap: opens the owner chat and sends the owner link, so corrections come in without Nasim.
  const send = tel && q.slug && q.ownerUrl
    ? `<button type="button" data-send="${esc(q.slug)}" data-wa="${esc(waLink(tel, `${hi}

Mit diesem Link ändern Sie Öffnungszeiten, Telefon und Fotos selbst: ${q.ownerUrl}`))}">Chat + Link senden</button>` : '';
  const same = tel && q.pagePhone && dialable(q.pagePhone) === tel ? '<span class="b ok">Nummer passt zur Seite ✓</span>' : '';
  const line = [CL.role[q.role], CL.wish[q.wish], CHANNEL_DE[q.channel]].filter(Boolean).join(' · ');
  const done = q.doneAt
    ? `<button type="button" data-done="${q.id}" data-to="0" class="rot">Wieder offen</button>`
    : `<button type="button" data-done="${q.id}" data-to="1">Erledigt</button>`;
  const head = q.slug
    ? `<a href="https://${esc(q.slug)}.namax.at/" target="_blank" rel="noopener">${esc(q.venueName || q.slug)}</a>`
    : `${esc(q.lokal || '–')}</b><span class="b">Neues Lokal</span><b>`;  // from namax.at/kostenlos, no page yet
  return `<li class="rq"><b>${head}</b>`
    + (q.wish === 'website' && !q.doneAt ? '<span class="b hot">Website!</span>' : '')
    + same
    + `<small>${esc(viennaTime(q.at))} · ${esc(line)}</small>`
    + `<p class="who"><span class="nm">${esc(q.name || '–')}</span> · ${esc(q.phone)}</p>`
    + (q.text ? `<p class="tx">${esc(q.text)}</p>` : '')
    + `<div class="a">${main}${send}${q.chatOpen == null ? '' : chatButton(q.slug, q.chatOpen)}${done}</div></li>`;
}

// Chat switch and "Erledigt" on both pages of the list.
const SWITCH_JS = `function post(b,body,ok){var o=b.textContent;b.disabled=true;b.textContent='…';
fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){b.disabled=false;ok(j)},function(){b.textContent=o;b.disabled=false;alert('Hat nicht geklappt. Bitte nochmal versuchen.')})}
document.addEventListener('click',function(e){var b=e.target.closest('[data-chat]');
if(b){var on=b.dataset.to==='1',slug=b.dataset.chat;
if(on&&!confirm('Chat freischalten? Schicken Sie dem Inhaber danach seinen Link.'))return;
post(b,{slug:slug,chatOpen:on},function(){[].forEach.call(document.querySelectorAll('[data-chat="'+slug+'"]'),function(x){x.dataset.to=on?'0':'1';x.textContent=on?'Chat sperren':'Chat freischalten';x.className=on?'rot':''})});return}
b=e.target.closest('[data-send]');
if(b){var s=b.dataset.send,c=document.querySelector('[data-chat="'+s+'"]');window.open(b.dataset.wa,'_blank','noopener');
if(c&&c.dataset.to==='1')post(c,{slug:s,chatOpen:true},function(){[].forEach.call(document.querySelectorAll('[data-chat="'+s+'"]'),function(x){x.dataset.to='0';x.textContent='Chat sperren';x.className='rot'})});return}
b=e.target.closest('[data-done]');if(b){post(b,{requestId:Number(b.dataset.done),done:b.dataset.to==='1'},function(){location.reload()})}});`;

/**
 * view 'anfragen' (start page): the owner requests, also when there are none yet.
 * view 'lokale': one button per district with its count.
 */
function renderChooser(districts, total, requests = [], view = 'anfragen', visits = null, top = [], cities = null, city = 'wien') {
  const btn = (d, label, n) => `<button type="button" data-pick="${d}">${esc(label)} <span>${n}</span></button>`;
  const picks = districts.map(({ d, n }) => btn(d, districtLabel(city, d), n)).join('') + btn('all', 'Alle Bezirke', total);
  const open = requests.filter((q) => !q.doneAt), done = requests.filter((q) => q.doneAt);
  const reqs = `<section class="req"><h2>Anfragen <span>${open.length}</span></h2>`
    + (open.length ? `<ul>${open.slice(0, MAX_SHOWN_REQUESTS).map(requestCard).join('')}</ul>`
      : requests.length ? '<p class="none">Keine offenen Anfragen</p>'
      : '<p class="none">Noch keine Anfragen. Neue erscheinen hier, sobald ein Inhaber auf seiner Seite das Formular „Sind Sie der Inhaber?“ ausfüllt.</p>')
    + (open.length > MAX_SHOWN_REQUESTS ? `<p class="none">${open.length - MAX_SHOWN_REQUESTS} ältere Anfragen nicht angezeigt</p>` : '')
    + (done.length ? `<details><summary>Erledigt (${done.length})</summary><ul>${done.slice(0, MAX_SHOWN_REQUESTS).map(requestCard).join('')}</ul></details>` : '')
    + '</section>';
  const busy = top.filter((x) => x.week > 0).slice(0, 10);
  const topList = !busy.length ? '' : `<section class="req"><h2>Meistbesucht · 7 Tage</h2><ol class="top">`
    + busy.map((x) => `<li><a href="https://${esc(x.slug)}.namax.at/" target="_blank" rel="noopener">${esc(x.name || x.slug)}</a> <span>${x.week}</span></li>`).join('')
    + '</ol></section>';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>namax · Admin</title><meta name="theme-color" content="#111">
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f3ef;color:#111}
header{background:#111;color:#fff;padding:14px}h1{margin:0;font-size:18px}h1 span{opacity:.7;font-weight:400}
${TABS_CSS}
${VIS_CSS}
${CITIES_CSS}
.top{margin:0;padding:0 0 0 28px}.top li{background:#fff;border-radius:8px;padding:10px 12px;margin:6px 0;display:flex;justify-content:space-between;gap:10px}.top a{color:#111;font-weight:600}.top span{color:#555}
.pick{display:grid;gap:8px;padding:12px;max-width:760px;margin:0 auto}
.pick button{display:flex;justify-content:space-between;align-items:center;font:inherit;font-size:17px;font-weight:600;min-height:52px;padding:10px 16px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#111;text-align:left}
.pick span{font-weight:400;color:#666}
.req{max-width:760px;margin:0 auto;padding:12px 12px 0}.req h2{margin:4px 2px 6px;font-size:18px}.req h2 span{display:inline-block;min-width:26px;padding:1px 8px;border-radius:999px;background:#ffc93c;text-align:center}
.req ul{list-style:none;margin:0;padding:0}.rq{background:#fff;border-radius:10px;padding:12px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rq b{font-size:17px}.rq b a{color:#111}.rq small{display:block;color:#555;margin-top:2px}.rq p{margin:6px 0 0}.rq .tx{white-space:pre-wrap;background:#f4f3ef;border-radius:6px;padding:6px 8px}
.b{display:inline-block;margin-left:8px;font-size:12px;padding:2px 8px;border-radius:999px;background:#eee;vertical-align:2px}.b.hot{background:#ffc93c;font-weight:700}.b.ok{background:#d8f3dc}
.a{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.a a,.a button{font:inherit;font-size:15px;font-weight:600;min-height:42px;padding:9px 14px;border-radius:8px;border:1px solid #111;background:#fff;color:#111;text-decoration:none}
.a a.pg{background:#111;color:#fff}.a .rot{border-color:#bbb;color:#555;font-weight:500}.no{font-size:13px;color:#888;align-self:center}
details{margin:6px 2px 4px}summary{min-height:44px;display:flex;align-items:center;color:#555;cursor:pointer}.none{color:#666;margin:4px 2px}</style></head><body>
<header><h1>namax · Admin${view === 'lokale' ? ` <span>${total} Lokale</span>` : ''}</h1>${visLine(visits)}${tabsNav(view, open.length)}</header>
${view === 'lokale' ? `${topList}${cityNav(cities, city)}<div class="pick" role="group" aria-label="Bezirk wählen">${picks}</div>` : reqs}
<script>(function(){${SWITCH_JS}})();</script>
<script>(function(){${TABS_JS}${NAV_JS}
document.addEventListener('click',function(e){var b=e.target.closest('[data-pick]');if(b)go(b.dataset.pick)})})();</script>
</body></html>`;
}

// Overture Maps second opinion on each venue (tools/places/overture-apply.mjs); everything but "both" is worth a look.
const shortSite = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const CHECK_CLASS = { both: 'ok', osm: 'wn', other: 'bad', closed: 'bad' };
const checkLabel = (c) => ({ both: '2 Quellen ✓', osm: 'nur OSM', closed: 'geschlossen?' })[c.verdict]
  || `anderes Geschäft: ${c.name || '?'}?`;

/**
 * rows: [{ slug, name, kind, street, district, status, confirmed, ownerUrl|null, facadeUrl|null, check|null }]
 * check: { verdict: both|osm|other|closed, name, phone, website } from Overture Maps. → HTML (German, phone first).
 * options.districts: [{ d, n }] for every district (the menu switches between them); options.district: the one shown, or 'all';
 * options.chooser: render the district start page instead of cards.
 */
export function renderAdmin(rows, { districts = null, district = null, chooser = false, requests = [], view = 'anfragen', openRequests = 0, visits = null, top = [], cities = null, city = 'wien' } = {}) {
  if (chooser && districts) return renderChooser(districts, districts.reduce((a, x) => a + x.n, 0), requests, view, visits, top, cities, city);
  const kinds = [...new Set(rows.map((r) => r.kind))].sort((a, b) => kindDe(a).localeCompare(kindDe(b), 'de'));
  const all = districts;
  const inRows = [...new Set(rows.map((r) => r.district).filter(Boolean))].sort((a, b) => a - b);
  const items = rows.map((r) => {
    const page = `https://${r.slug}.namax.at/`;
    const c = r.check;
    const badges = (r.status === 'hidden' ? '<span class="b">versteckt</span>' : '') + (r.confirmed ? '<span class="b ok">bestätigt</span>' : '')
      + (c ? `<span class="b ${CHECK_CLASS[c.verdict]}">${esc(checkLabel(c))}</span>` : '')
      + (r.chatOpen ? '<span class="b chat">Chat offen</span>' : '');
    const ovLine = c && c.verdict !== 'osm' && (c.name || c.phone || c.website)
      ? `<small class="ov">Overture: ${esc(c.name || '')}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}`
        + `${c.website ? ` · <a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(shortSite(c.website))}</a>` : ''}</small>` : '';
    const chat = chatButton(r.slug, r.chatOpen);
    const vis = r.status === 'hidden'
      ? `<button type="button" class="rot" data-status="public" data-slug="${esc(r.slug)}">Seite zeigen</button>`
      : `<button type="button" class="rot" data-status="hidden" data-slug="${esc(r.slug)}">Seite verstecken</button>`;
    const o = r.ownerUrl || '';
    const owner = `<div class="a o" data-orow${o ? '' : ' data-none'}><span class="lab">Für den Inhaber</span>`
      + `<span class="no">kein Link</span>`
      + `<button type="button" class="has" data-copy="${esc(o)}">Link</button>`
      + `<button type="button" class="has" data-qr="${esc(o)}" data-owner>QR</button>`
      + `<a class="has" href="${o ? 'https://wa.me/?text=' + encodeURIComponent(o) : '#'}" data-wa rel="noopener">WhatsApp</a>`
      + `<button type="button" class="rot" data-rotate="${esc(r.slug)}">Neuer Link</button></div>`;
    const th = thumbSrc(r.facadeUrl);
    const photo = `<div class="a fr" data-frow${th ? '' : ' data-none'}><span class="lab">Foto vom Lokal</span>`
      + (th ? `<img class="th" src="${esc(th)}" alt="">` : '')
      + `<button type="button" data-facade="${esc(r.slug)}">Foto</button>`
      + `<button type="button" class="has rot" data-fdel="${esc(r.slug)}">Foto löschen</button></div>`;
    const q = `${r.name} ${r.street} ${r.slug}`.toLowerCase();
    return `<li data-q="${esc(q)}" data-kind="${esc(r.kind)}" data-d="${esc(r.district || '')}" data-check="${esc(c ? c.verdict : '')}" data-name="${esc(r.name)}"><b>${esc(r.name)}</b>${badges}
<small>${esc(kindDe(r.kind))} · ${esc(r.street)}${r.district ? ` · ${esc(city === 'wien' ? `${r.district}. Bezirk` : districtLabel(city, r.district))}` : ''}</small>
${r.visits ? `<small class="seen">Besuche: heute ${r.visits.today} · 7 Tage ${r.visits.week} · gesamt ${r.visits.total}</small>\n` : ''}<div class="a"><a class="pg" href="${esc(page)}" target="_blank" rel="noopener">Seite</a><button type="button" data-qr="${esc(page)}">QR</button><button type="button" data-share="${esc(page)}">Teilen</button>${vis}${chat}</div>
${ovLine}
${owner}
${photo}</li>`;
  }).join('\n');
  const chips = ['<button type="button" class="on" data-k="">Alle</button>', ...kinds.map((k) => `<button type="button" data-k="${esc(k)}">${esc(kindDe(k))}</button>`)].join('');
  const total = all ? all.reduce((a, x) => a + x.n, 0) : 0;
  const dsel = all
    ? `<select data-dnav aria-label="Bezirk">${all.map(({ d, n }) => `<option value="${d}"${String(d) === String(district) ? ' selected' : ''}>${esc(districtLabel(city, d))} (${n})</option>`).join('')}`
      + `<option value="all"${district === 'all' ? ' selected' : ''}>Alle Bezirke (${total})</option></select>`
    : inRows.length > 1
      ? `<select data-dsel aria-label="Bezirk"><option value="">Alle Bezirke</option>${inRows.map((d) => `<option value="${d}">${esc(city === 'wien' ? `${d}. Bezirk` : districtLabel(city, d))}</option>`).join('')}</select>` : '';
  // Another city: back to the city row on the "Lokale" chooser.
  const csel = cities && cities.length > 1
    ? `<select data-cnav aria-label="Stadt">${cities.map((c) => `<option value="${esc(c.c)}"${c.c === city ? ' selected' : ''}>${esc(c.name)} (${c.n})</option>`).join('')}</select>` : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>namax · Lokale</title><meta name="theme-color" content="#111">
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f3ef;color:#111}
${TABS_CSS}
${VIS_CSS}
.seen{color:#0b6b3a!important}
header{position:sticky;top:0;z-index:2;background:#111;color:#fff;padding:12px 14px 10px}
h1{margin:0 0 8px;font-size:18px}h1 span{opacity:.7;font-weight:400}
input[type=search]{width:100%;font:inherit;font-size:17px;padding:12px;border:0;border-radius:8px}
.f{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px;-webkit-overflow-scrolling:touch}
.f button,select{flex:none;font:inherit;font-size:14px;padding:7px 12px;border-radius:999px;border:1px solid #555;background:#222;color:#fff}
.f button.on{background:#ffc93c;color:#111;border-color:#ffc93c}select{margin-top:8px;width:100%;border-radius:8px}
ul{list-style:none;margin:0;padding:8px 10px 40px;max-width:760px;margin:0 auto}
li{background:#fff;border-radius:10px;padding:12px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.08)}
li b{font-size:17px}li small{display:block;color:#555;margin-top:2px}
.b{display:inline-block;margin-left:8px;font-size:12px;padding:2px 8px;border-radius:999px;background:#eee;vertical-align:2px}.b.ok{background:#d8f3dc}.b.wn{background:#fff3c4}.b.bad{background:#ffd9d9}.b.chat{background:#dbe8ff}
.ov{color:#333!important}.ov a{color:#0b57d0}
.a{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.a a,.a button{font:inherit;font-size:15px;font-weight:600;min-height:42px;padding:9px 14px;border-radius:8px;border:1px solid #111;background:#fff;color:#111;text-decoration:none}
.a a.pg{background:#111;color:#fff}.no{font-size:13px;color:#888;align-self:center}
.o{margin-top:8px;padding-top:8px;border-top:1px dashed #ccc;align-items:center}.lab{font-size:13px;color:#555;width:100%}
.o[data-none] .has{display:none}.o:not([data-none]) .no{display:none}.a .rot{border-color:#bbb;color:#555;font-weight:500}
.empty{text-align:center;color:#666;padding:30px}
#qr{position:fixed;inset:0;z-index:9;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}
#qr[hidden]{display:none}#qr svg{width:min(86vw,62vh);height:auto}#qr b{font-size:20px;margin:14px 0 4px}#qr p{margin:2px 0;color:#555}
#qr .warn{color:#b00020;font-weight:700}#qr small{margin-top:18px;color:#888}
.fr{margin-top:8px;padding-top:8px;border-top:1px dashed #ccc;align-items:center}.fr[data-none] .has{display:none}
.th{width:64px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #ccc}
#crop{position:fixed;inset:0;z-index:10;background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;touch-action:none}
#crop[hidden]{display:none}#crop b{font-size:17px}#crop p{margin:0;font-size:14px;opacity:.8;text-align:center}
.frame{position:relative;width:min(94vw,calc(62vh*4/3));aspect-ratio:4/3;overflow:hidden;border-radius:10px;background:#000;box-shadow:0 0 0 2px #fff;cursor:grab}
.frame img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;user-select:none;-webkit-user-drag:none;pointer-events:none}
#crop input[type=range]{width:min(94vw,520px)}
.cb{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.cb button{font:inherit;font-size:16px;font-weight:700;min-height:48px;padding:10px 18px;border-radius:10px;border:1px solid #fff;background:transparent;color:#fff}
.cb .go{background:#ffc93c;border-color:#ffc93c;color:#111}.cb button:disabled{opacity:.5}</style></head><body>
<header><h1>namax · Lokale <span data-count>${rows.length}</span></h1>${visLine(visits)}${tabsNav('lokale', openRequests)}
<input type="search" placeholder="Name oder Straße" aria-label="Suche" autocomplete="off">
<div class="f" role="group" aria-label="Art">${chips}<button type="button" data-only-check>Nur prüfen</button></div>${csel}${dsel}</header>
<ul>${items}</ul><p class="empty" hidden>Nichts gefunden</p>
<div id="qr" hidden role="dialog" aria-label="QR-Code"></div>
<input type="file" accept="image/*" id="fpick" hidden>
<div id="crop" hidden role="dialog" aria-label="Foto zuschneiden"><b data-cname></b><p>Ziehen zum Verschieben, mit zwei Fingern oder dem Regler zoomen</p>
<div class="frame" data-frame><img alt="" data-cimg></div>
<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom" data-zoom>
<div class="cb"><button type="button" class="go" data-cuse>Verwenden</button><button type="button" data-cagain>Neu wählen</button><button type="button" data-cno>Abbrechen</button></div></div>
<script src="/js/qrcode.js"></script>
<script>(function(){${SWITCH_JS}})();</script>
<script>(function(){var ov=document.getElementById('qr');
function svg(t){var q=qrcode(0,'M');q.addData(t);q.make();var n=q.getModuleCount(),m=4,p='';for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.isDark(r,c))p+='M'+(c+m)+' '+(r+m)+'h1v1h-1z';
return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+2*m)+' '+(n+2*m)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="'+p+'" fill="#000"/></svg>'}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function showQr(url,name,owner){ov.innerHTML=svg(url)+'<b>'+esc(name)+'</b>'+(owner?'<p class="warn">Nur für den Inhaber. Nicht aufhängen.</p><p>Öffnet die Verwaltung der Seite.</p>':'<p>Mit der Handykamera scannen</p>')+'<small>Tippen zum Schließen</small>';ov.hidden=false}
ov.addEventListener('click',function(){ov.hidden=true;ov.innerHTML=''});
function copy(b,t){var done=function(){var o=b.textContent;b.textContent='Kopiert ✓';setTimeout(function(){b.textContent=o},1500)};
if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,function(){prompt('Kopieren:',t)});else prompt('Kopieren:',t)}
function setOwner(row,url){row.removeAttribute('data-none');row.querySelector('[data-copy]').dataset.copy=url;row.querySelector('[data-qr]').dataset.qr=url;row.querySelector('[data-wa]').href='https://wa.me/?text='+encodeURIComponent(url)}
document.addEventListener('click',function(e){var li=e.target.closest('li'),name=li?li.dataset.name:'';
var x=e.target.closest('[data-qr]');if(x){showQr(x.dataset.qr,name,x.hasAttribute('data-owner'));return}
x=e.target.closest('[data-share]');if(x){var u=x.dataset.share;if(navigator.share)navigator.share({title:name,url:u}).catch(function(){});else copy(x,u);return}
x=e.target.closest('[data-copy]');if(x){copy(x,x.dataset.copy);return}
x=e.target.closest('[data-status]');if(x){var st=x.dataset.status,show=st==='public';
if(!confirm(show?'„'+name+'“ wieder zeigen (in Google und in der Übersicht)?':'„'+name+'“ verstecken? Die Seite ist dann nicht mehr in Google und in der Übersicht, öffnet sich aber noch über den direkten Link.'))return;
var ot=x.textContent;x.disabled=true;x.textContent='…';
fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:x.dataset.slug,status:st})})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(){var b=li.querySelector('b'),h=li.querySelector('.b:not(.ok):not(.wn):not(.bad)');
if(show){if(h&&h.textContent==='versteckt')h.remove();x.dataset.status='hidden';x.textContent='Seite verstecken'}
else{b.insertAdjacentHTML('afterend','<span class="b">versteckt</span>');x.dataset.status='public';x.textContent='Seite zeigen'}x.disabled=false},
function(){x.textContent=ot;x.disabled=false;alert('Hat nicht geklappt. Bitte nochmal versuchen.')});return}
x=e.target.closest('[data-rotate]');if(x){if(!confirm('Neuen Link für „'+name+'“ erstellen? Der alte Inhaber-Link funktioniert dann nicht mehr.'))return;
var o=x.textContent;x.disabled=true;x.textContent='…';
fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:x.dataset.rotate})})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){setOwner(x.closest('[data-orow]'),j.ownerUrl);x.textContent='Fertig ✓';setTimeout(function(){x.textContent=o;x.disabled=false},2000)},
function(){x.textContent=o;x.disabled=false;alert('Hat nicht geklappt. Bitte nochmal versuchen.')})}});})();</script>
<script>(function(){var q='',k='',d='',ck=false,lis=[].slice.call(document.querySelectorAll('li')),cnt=document.querySelector('[data-count]'),empty=document.querySelector('.empty');
function run(){var n=0;for(var i=0;i<lis.length;i++){var l=lis[i],ok=(!q||l.dataset.q.indexOf(q)>=0)&&(!k||l.dataset.kind===k)&&(!d||l.dataset.d===d)&&(!ck||(l.dataset.check&&l.dataset.check!=='both'));l.hidden=!ok;if(ok)n++}cnt.textContent=n;empty.hidden=n>0}
document.querySelector('input[type=search]').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();run()});
var sel=document.querySelector('[data-dsel]');if(sel)sel.addEventListener('change',function(){d=sel.value;run()});
${NAV_JS}
var nav=document.querySelector('[data-dnav]');if(nav)keep(nav.value);${TABS_JS}
if(nav){nav.addEventListener('change',function(){go(nav.value)})}
var cn=document.querySelector('[data-cnav]');if(cn)cn.addEventListener('change',function(){location.href='/liste?v=lokale'+(cn.value==='wien'?'':'&c='+cn.value)});
document.addEventListener('click',function(e){var c=e.target.closest('[data-k]');if(c){k=c.dataset.k;[].forEach.call(document.querySelectorAll('[data-k]'),function(b){b.className=b===c?'on':''});run()}
c=e.target.closest('[data-only-check]');if(c){ck=!ck;c.className=ck?'on':'';run()}});})();</script>
<script>(function(){var pick=document.getElementById('fpick'),cr=document.getElementById('crop'),fr=cr.querySelector('[data-frame]'),im=cr.querySelector('[data-cimg]'),zm=cr.querySelector('[data-zoom]'),use=cr.querySelector('[data-cuse]');
var slug='',li=null,url='',s0=1,s=1,x=0,y=0,pts={},last=null;
function W(){return fr.clientWidth}function H(){return fr.clientHeight}
function draw(){var w=im.naturalWidth*s,h=im.naturalHeight*s;x=Math.min(0,Math.max(W()-w,x));y=Math.min(0,Math.max(H()-h,y));im.style.transform='translate('+x+'px,'+y+'px) scale('+s+')'}
function zoomTo(ns,cx,cy){ns=Math.max(s0,Math.min(s0*4,ns));x=cx-(cx-x)*ns/s;y=cy-(cy-y)*ns/s;s=ns;zm.value=s/s0;draw()}
function open(file){if(!file)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(file);
im.onload=function(){cr.hidden=false;s0=s=Math.max(W()/im.naturalWidth,H()/im.naturalHeight);x=(W()-im.naturalWidth*s)/2;y=(H()-im.naturalHeight*s)/2;zm.value=1;draw()};
im.onerror=function(){alert('Dieses Bild kann der Browser nicht öffnen.')};im.src=url}
function close(){cr.hidden=true;im.removeAttribute('src');if(url){URL.revokeObjectURL(url);url=''}pick.value=''}
function src(u){return /^https:/.test(u)?u:'/'+u}
function setPhoto(l,u){var row=l.querySelector('[data-frow]'),th=row.querySelector('.th');
if(u){if(!th){th=document.createElement('img');th.className='th';th.alt='';row.insertBefore(th,row.querySelector('[data-facade]'))}th.src=src(u);row.removeAttribute('data-none')}
else{if(th)th.remove();row.setAttribute('data-none','')}
var pg=l.querySelector('a.pg');pg.href=pg.href.split('?')[0]+'?f='+Date.now()}
fr.addEventListener('pointerdown',function(e){fr.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};last=null});
fr.addEventListener('pointermove',function(e){var p=pts[e.pointerId];if(!p)return;var ids=Object.keys(pts);
if(ids.length===1){x+=e.clientX-p.x;y+=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;draw();return}
p.x=e.clientX;p.y=e.clientY;var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y),r=fr.getBoundingClientRect(),cx=(a.x+b.x)/2-r.left,cy=(a.y+b.y)/2-r.top;
if(last){x+=cx-last.cx;y+=cy-last.cy;zoomTo(s*d/last.d,cx,cy)}last={d:d,cx:cx,cy:cy}});
function up(e){delete pts[e.pointerId];last=null}
fr.addEventListener('pointerup',up);fr.addEventListener('pointercancel',up);
fr.addEventListener('wheel',function(e){e.preventDefault();var r=fr.getBoundingClientRect();zoomTo(s*(e.deltaY<0?1.1:1/1.1),e.clientX-r.left,e.clientY-r.top)},{passive:false});
zm.addEventListener('input',function(){zoomTo(s0*Number(zm.value),W()/2,H()/2)});
pick.addEventListener('change',function(){open(pick.files[0])});
cr.querySelector('[data-cno]').addEventListener('click',close);
cr.querySelector('[data-cagain]').addEventListener('click',function(){pick.value='';pick.click()});
use.addEventListener('click',function(){var c=document.createElement('canvas');c.width=1600;c.height=1200;
c.getContext('2d').drawImage(im,-x/s,-y/s,W()/s,H()/s,0,0,1600,1200);
function done(){use.disabled=false;use.textContent='Verwenden'}
use.disabled=true;use.textContent='Lädt…';
c.toBlob(function(blob){if(!blob){alert('Das Bild ist zu groß für dieses Handy.');done();return}
var f=new FormData();f.append('slug',slug);f.append('photo',blob,'facade.jpg');
fetch(location.pathname,{method:'POST',body:f}).then(function(r){if(!r.ok)throw 0;return r.json()})
.then(function(j){setPhoto(li,j.url);close();done()},function(){alert('Hochladen hat nicht geklappt. Bitte nochmal versuchen.');done()})},'image/jpeg',0.82)});
document.addEventListener('click',function(e){var b=e.target.closest('[data-facade]');
if(b){li=b.closest('li');slug=b.dataset.facade;cr.querySelector('[data-cname]').textContent=li.dataset.name;pick.value='';pick.click();return}
b=e.target.closest('[data-fdel]');if(!b)return;var l=b.closest('li');if(!confirm('Foto von „'+l.dataset.name+'“ löschen?'))return;
var f=new FormData();f.append('slug',b.dataset.fdel);f.append('delete','1');
fetch(location.pathname,{method:'POST',body:f}).then(function(r){if(!r.ok)throw 0;setPhoto(l,null)},function(){alert('Löschen hat nicht geklappt.')})});})();</script>
</body></html>`;
}
