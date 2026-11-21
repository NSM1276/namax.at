// Turns one venue facts object into a complete, self-contained HTML page.
// A block whose data is missing is left out entirely; nothing is invented.
import { T, OWNER_LINE, listTitle, kindLabel, languageName } from './i18n.mjs';
import { PALETTES, LETTERINGS, DEFAULT_THEME } from './themes.mjs';
import { openState, formatMinute, viennaNow } from './hours.mjs';

const SITE = 'https://www.namax.at';
const OWNER_CHAT_FALLBACK = 'https://wa.me/4367764292055'; // replaced by the real chat in part 2

export function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A long single word ("Änderungsschneiderei") cannot wrap, so the title shrinks until that word fits a phone.
function titleSize(name) {
  const longest = Math.max(...String(name).split(/\s+/).map((w) => w.length));
  const vw = Math.round((130 / longest) * 10) / 10;
  return vw < 12.5 ? ` style="font-size:clamp(22px,${vw}vw,72px)"` : '';
}

// An element whose text switches with the language toggle.
const tr = (de, en, tag = 'span', attrs = '') =>
  `<${tag}${attrs ? ' ' + attrs : ''} data-de="${esc(de)}" data-en="${esc(en)}">${esc(de)}</${tag}>`;
const ui = (key, tag, attrs) => tr(T.de[key], T.en[key], tag, attrs);
const label = (x, tag, attrs) => (typeof x === 'string' ? tr(x, x, tag, attrs) : tr(x.de, x.en, tag, attrs));

const month = (ym) => `${ym.slice(5)}/${ym.slice(0, 4)}`;
const price = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
const comma = (n) => String(n).replace('.', ',');

const titleOf = (v, lang) => {
  const kind = kindLabel(v.kind, lang);
  return `${v.name} — ${v.area || [kind, v.address.zip + ' ' + v.address.city].filter(Boolean).join(', ')}`;
};

function head(v, pal, let_) {
  const kind = kindLabel(v.kind, 'de');
  const where = `${v.address.street}, ${v.address.zip} ${v.address.city}`;
  const title = titleOf(v, 'de');
  const desc = `${v.name}${kind ? ': ' + kind : ''}, ${where}. ${T.de.desc}`;
  const robots = v.status === 'public'
    ? `<link rel="canonical" href="https://${v.slug}.namax.at/">`
    : '<meta name="robots" content="noindex, nofollow">';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${robots}
<meta name="theme-color" content="${pal.signBg}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<style>${let_.faces}${css(pal, let_)}</style>`;
}

function css(p, l) {
  return `
:root{--sign-bg:${p.signBg};--sign-ink:${p.signInk};--bg:${p.pageBg};--ink:${p.ink};--accent:${p.accent};--accent-ink:${p.accentInk};--board-bg:${p.boardBg};--board-ink:${p.boardInk};
--display:${l.family};--body:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.45 var(--body)}
.wrap{max-width:560px;margin:0 auto;padding:0 16px}
h1,h2{margin:0;font-family:var(--display);font-weight:${l.weight};letter-spacing:${l.spacing};${l.upper ? 'text-transform:uppercase;' : ''}line-height:1}
a{color:inherit}
.sign{background:var(--sign-bg);color:var(--sign-ink);padding:10px 12px 14px}
.sign .wrap{padding:0}
.lang{display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px}
.lang button{min-width:44px;min-height:44px;border:0;background:none;color:inherit;font:700 14px var(--body);letter-spacing:.06em;opacity:.82;cursor:pointer}
.lang button[aria-pressed="true"]{opacity:1;text-decoration:underline;text-underline-offset:5px}
.plate{border:2px solid currentColor;padding:26px 14px 24px;text-align:center}
.area{margin:0 0 12px;font:700 12px/1.3 var(--body);letter-spacing:.16em;text-transform:uppercase}
h1{font-size:clamp(38px,12.5vw,72px);overflow-wrap:anywhere;hyphens:auto}
.status{display:flex;align-items:center;gap:10px;margin:18px 0 0;font-weight:700;font-size:18px}
.status::before{content:"";flex:none;width:12px;height:12px;border-radius:50%;background:#8a8a8a}
.status.is-open::before{background:#1e9e4a}
.status.is-closed::before{background:#c8372d}
.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0 0}
.btn{display:flex;align-items:center;justify-content:center;min-height:54px;padding:10px 14px;border:2px solid var(--ink);border-radius:6px;font-weight:700;font-size:18px;text-decoration:none;text-align:center}
.btn.primary{background:var(--accent);color:var(--accent-ink)}
section{margin:30px 0 0}
h2{font-size:28px;margin-bottom:12px}
.board{background:var(--board-bg);color:var(--board-ink);border:3px solid var(--ink);border-radius:4px;padding:22px 16px 16px}
.board h2{text-align:center;font-size:34px;margin-bottom:16px}
.group+.group{margin-top:18px}
.group h3{margin:0 0 6px;font:700 12px/1.3 var(--body);letter-spacing:.16em;text-transform:uppercase;opacity:.7}
.row{display:flex;align-items:baseline;gap:8px;padding:7px 0}
.row .n{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}
.row .n small{display:block;font-size:14px;opacity:.7}
.row .d{flex:1 1 16px;min-width:16px;border-bottom:2px dotted currentColor;opacity:.3;transform:translateY(-4px)}
.row .p{flex:none;white-space:nowrap;font-family:var(--display);font-weight:${l.weight};font-size:24px;line-height:1;font-variant-numeric:tabular-nums}
.stand{margin:14px 0 0;font-size:13px;opacity:.7;text-align:center}
.facts{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.facts li{border:2px solid var(--ink);border-radius:999px;padding:7px 14px;font-weight:700;font-size:15px}
.rating{margin:0;font-size:17px}
.rating b{font-family:var(--display);font-weight:${l.weight};font-size:30px;line-height:1;margin-right:4px}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.photos img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px}
.hours{margin:0}
.hours div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}
.hours dt,.hours dd{margin:0}
.hours .today{font-weight:700}
address{font-style:normal}
address a{display:inline-flex;align-items:center;min-height:44px;margin-top:2px;font-weight:700}
footer{margin:40px 0 0;padding:20px 0 28px;border-top:1px solid color-mix(in srgb,var(--ink) 18%,transparent);font-size:13px;opacity:.8}
footer p{margin:0 0 6px}
footer a{display:inline-flex;align-items:center;min-height:44px;margin-right:18px}
@media (min-width:700px){.sign{padding:16px 16px 22px}.plate{padding:40px 24px 36px}}
`;
}

function sign(v) {
  const area = v.area ? `<p class="area">${esc(v.area)}</p>` : '';
  return `<header class="sign"><div class="wrap">
<div class="lang" role="group" aria-label="Sprache / Language"><button type="button" data-lang="de" lang="de" aria-label="Deutsch" aria-pressed="true">DE</button><button type="button" data-lang="en" lang="en" aria-label="English" aria-pressed="false">EN</button></div>
<div class="plate">${area}<h1${titleSize(v.name)}>${esc(v.name)}</h1></div>
</div></header>`;
}

function mapsUrl(v) {
  const q = encodeURIComponent(`${v.name}, ${v.address.street}, ${v.address.zip} ${v.address.city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

function actions(v) {
  const call = v.phone ? `<a class="btn primary" href="tel:${esc(v.phone)}">${ui('call')}</a>` : '';
  return `<nav class="actions">${call}<a class="btn${v.phone ? '' : ' primary'}" href="${esc(mapsUrl(v))}" rel="noopener">${ui('route')}</a></nav>`;
}

function board(v) {
  if (!v.list) return '';
  const groups = v.list.groups.map((g) => {
    const rows = g.items.map((it) => {
      const note = it.note ? label(it.note, 'small') : '';
      const p = it.price != null ? `<span class="d"></span><span class="p">${price(it.price)}&nbsp;€</span>` : '';
      return `<div class="row"><span class="n">${label(it.name)}${note}</span>${p}</div>`;
    }).join('');
    return `<div class="group">${g.title ? label(g.title, 'h3') : ''}${rows}</div>`;
  }).join('');
  return `<section class="board" id="liste">${tr(listTitle(v.kind, 'de'), listTitle(v.kind, 'en'), 'h2')}${groups}
<p class="stand">${tr(`${T.de.asOf}: ${month(v.list.asOf)} · ${T.de.pricesNote}`, `${T.en.asOf}: ${month(v.list.asOf)} · ${T.en.pricesNote}`)}</p></section>`;
}

function facts(v) {
  const f = v.facts;
  if (!f) return '';
  const li = [];
  if (f.walkIn === true) li.push(ui('walkIn', 'li'));
  if (f.walkIn === false) li.push(ui('byAppointment', 'li'));
  for (const p of f.payment || []) li.push(ui(p, 'li'));
  if (f.transit) li.push(tr(`${T.de.transit}: ${f.transit}`, `${T.en.transit}: ${f.transit}`, 'li'));
  if (f.languages && f.languages.length) {
    const names = (lang) => f.languages.map((c) => languageName(c, lang)).join(', ');
    li.push(tr(`${T.de.languages}: ${names('de')}`, `${T.en.languages}: ${names('en')}`, 'li'));
  }
  return li.length ? `<section><ul class="facts">${li.join('')}</ul></section>` : '';
}

function rating(v) {
  const r = v.rating;
  if (!r) return '';
  const de = `${T.de.ratingOf} · ${r.count} ${T.de.reviewsOn} ${r.source} · ${T.de.asOf} ${month(r.date)}`;
  const en = `${T.en.ratingOf} · ${r.count} ${T.en.reviewsOn} ${r.source} · ${T.en.asOf} ${month(r.date)}`;
  return `<section><p class="rating"><b>${comma(r.value)}</b>${tr(de, en)}</p></section>`;
}

function photos(v) {
  if (!v.photos || !v.photos.length) return '';
  const src = (p) => (p.startsWith('https://') ? p : '/' + p);
  const imgs = v.photos.map((p) => `<img src="${esc(src(p))}" alt="${esc(v.name)}" loading="lazy">`).join('');
  return `<section class="photos" data-photos>${imgs}</section>`;
}

function hoursTable(v) {
  if (!v.hours) return '';
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map((d) => {
    const h = v.hours[d];
    const dd = h ? `<dd>${formatMinute(h[0])}–${formatMinute(h[1])}</dd>` : ui('closedDay', 'dd');
    return `<div data-day="${d}">${tr(T.de.daysLong[d], T.en.daysLong[d], 'dt')}${dd}</div>`;
  }).join('');
  return `<section>${ui('hoursTitle', 'h2')}<dl class="hours">${rows}</dl></section>`;
}

function address(v) {
  const a = v.address;
  return `<section>${ui('addressTitle', 'h2')}<address>${esc(a.street)}<br>${esc(a.zip)} ${esc(a.city)}<br>
<a href="${esc(mapsUrl(v))}" rel="noopener">${ui('mapLink')}</a></address></section>`;
}

function footer(v) {
  const by = v.confirmed === true
    ? ui('by')
    : tr(`${T.de.by} · ${T.de.unconfirmed}`, `${T.en.by} · ${T.en.unconfirmed}`);
  // OpenStreetMap data is licensed under the ODbL and must be credited where it is shown.
  const osm = v.source === 'osm'
    ? `<p>${ui('osmData')} <a href="https://www.openstreetmap.org/copyright" rel="noopener">© OpenStreetMap</a></p>` : '';
  return `<footer><p>${by}</p>${osm}<a href="${SITE}/impressum">${ui('imprint')}</a><a href="${SITE}/datenschutz">${ui('privacy')}</a></footer>`;
}

/** The part-1 owner bar (WhatsApp hook), used until the chat from owner-ui.mjs is passed instead. */
const OWNER_BAR_CSS = `.owner{position:fixed;left:0;right:0;bottom:0;z-index:5;background:#111;color:#fff;padding:14px 16px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.owner .wrap{padding:0}
.owner strong{display:block;font-size:19px}
.owner p{margin:4px 0 12px;font-size:15px;line-height:1.35;opacity:.9}
.owner a{display:flex;align-items:center;justify-content:center;min-height:56px;border-radius:6px;background:#ffc93c;color:#111;font-weight:800;font-size:20px;text-decoration:none}
body.has-owner{padding-bottom:210px}`;
export function ownerBar() {
  return { css: OWNER_BAR_CSS, script: '', html: `<section class="owner" data-owner><div class="wrap">
${ui('ownerHead', 'strong')}<p dir="auto">${esc(OWNER_LINE)}</p>
<a href="${OWNER_CHAT_FALLBACK}" data-chat-hook rel="noopener">${ui('chat')}</a>
</div></section>` };
}

function script(v) {
  const base = `
var lang='de';
try{var s=localStorage.getItem('namax-venue-lang');if(s==='en'||s==='de')lang=s}catch(e){}
var onLang=[];
function setLang(l){lang=l;var root=document.documentElement;root.lang=l;var tt=root.getAttribute('data-title-'+l);if(tt)document.title=tt;
var els=document.querySelectorAll('[data-de]');
for(var i=0;i<els.length;i++)els[i].textContent=els[i].getAttribute('data-'+l);
var bs=document.querySelectorAll('[data-lang]');
for(var j=0;j<bs.length;j++)bs[j].setAttribute('aria-pressed',String(bs[j].getAttribute('data-lang')===l));
for(var k=0;k<onLang.length;k++)onLang[k]()}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-lang]');if(!b)return;
setLang(b.getAttribute('data-lang'));try{localStorage.setItem('namax-venue-lang',lang)}catch(e){}});
`;
  const status = !v.hours ? '' : `
${openState.toString()}
${formatMinute.toString()}
${viennaNow.toString()}
var H=${JSON.stringify(v.hours)},W=${v.facts && v.facts.walkIn === true ? 'true' : 'false'};
var S=${JSON.stringify(Object.fromEntries(['de', 'en'].map((l) => [l, {
    openNow: T[l].openNow, until: T[l].until, closed: T[l].closed, opens: T[l].opens,
    opensAt: T[l].opensAt, walk: T[l].statusWalkIn, days: T[l].daysShort,
  }]))).replace(/</g, '\\u003c')};
function renderStatus(){var el=document.querySelector('[data-status]');if(!el)return;
var now=viennaNow(new Date()),st=openState(H,now.day,now.minute),s=S[lang],t;
if(st.open){t=s.openNow+' · '+s.until+' '+formatMinute(st.until);if(W)t+=' · '+s.walk}
else if(st.opensAt){t=s.closed+' · '+(st.opensAt.day===now.day&&!st.opensAt.nextWeek?s.opensAt+' ':s.opens+' '+s.days[st.opensAt.day]+' ')+formatMinute(st.opensAt.minute)}
else{t=s.closed}
el.textContent=t;el.className='status '+(st.open?'is-open':'is-closed');
var rows=document.querySelectorAll('[data-day]');
for(var i=0;i<rows.length;i++)rows[i].className=Number(rows[i].getAttribute('data-day'))===now.day?'today':''}
onLang.push(renderStatus);setInterval(renderStatus,60000);
`;
  return `<script>(function(){${base}${status}setLang(lang)})();</script>`;
}

/** venue → HTML. options.owner = { html, css, script } is added for the venue's owner only. */
export function renderVenue(venue, { owner } = {}) {
  const theme = { ...DEFAULT_THEME, ...(venue.theme || {}) };
  const pal = Object.hasOwn(PALETTES, theme.palette) ? PALETTES[theme.palette] : null;
  const let_ = Object.hasOwn(LETTERINGS, theme.lettering) ? LETTERINGS[theme.lettering] : null;
  if (!pal) throw new Error(`unknown palette "${theme.palette}"`);
  if (!let_) throw new Error(`unknown lettering "${theme.lettering}"`);
  const v = venue;
  const status = v.hours ? `<p class="status" data-status>${esc(T.de.statusFallback)}</p>` : '';
  return `<!doctype html>
<html lang="de" data-title-de="${esc(titleOf(v, 'de'))}" data-title-en="${esc(titleOf(v, 'en'))}">
<head>
${head(v, pal, let_)}
</head>
<body${owner ? ' class="has-owner"' : ''}>
${sign(v)}
<main class="wrap">
${status}
${actions(v)}
${board(v)}
${facts(v)}
${rating(v)}
${photos(v)}
${hoursTable(v)}
${address(v)}
${footer(v)}
</main>
${owner ? (owner.css ? `<style>${owner.css}</style>` : '') + owner.html : ''}
${script(v)}${owner && owner.script ? `\n<script>${owner.script}</script>` : ''}
</body>
</html>
`;
}
