// Turns one venue facts object into a complete, self-contained HTML page.
// A block whose data is missing is left out entirely; nothing is invented.
import { T, OWNER_LINE, listTitle, kindLabel, languageName } from './i18n.mjs';
import { PALETTES, LETTERINGS, DEFAULT_THEME, BRAND } from './themes.mjs';

// One sign face for every page (the namax brand); the venue's lettering field no longer changes it.
const LOOK = { family: BRAND.display, weight: 700, upper: true, spacing: '.01em', faces: BRAND.faces };
import { ogImageUrl } from './og-url.mjs';
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
  // Barlow Condensed bold capitals are about 0.5em wide; the rim leaves about 78vw on a phone.
  const vw = Math.floor((150 / longest) * 10) / 10;
  if (vw >= 15) return '';
  // cqi = 1% of the rim's width: the word fits at every screen size, without relying on the browser's hyphenation
  const cqi = Math.floor((100 / (longest * 0.52)) * 10) / 10;
  return ` style="font-size:clamp(20px,${vw}vw,80px);font-size:min(80px,${cqi}cqi)"`;
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
  return `${v.name} — ${[kind, v.area || v.address.zip + ' ' + v.address.city].filter(Boolean).join(', ')}`;
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
<meta property="og:url" content="https://${v.slug}.namax.at/">
<meta property="og:site_name" content="namax.at">
<meta property="og:locale" content="de_AT">
<meta property="og:image" content="${esc(ogImageUrl(v))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<style>${let_.faces}${css(pal, let_)}</style>`;
}

function css(p, l) {
  return `
:root{--sign-bg:${p.signBg};--sign-ink:${p.signInk};--bg:${p.pageBg};--ink:${p.ink};--accent:${p.accent};--accent-ink:${p.accentInk};--board-bg:${p.boardBg};--board-ink:${p.boardInk};
--display:${l.family};--body:${BRAND.text}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background-color:var(--bg);background-image:radial-gradient(color-mix(in srgb,var(--ink) 9%,transparent) 1px,transparent 1.3px);background-size:7px 7px;color:var(--ink);font:17px/1.5 var(--body)}
.wrap{max-width:560px;margin:0 auto;padding:0 16px}
h1,h2{margin:0;font-family:var(--display);font-weight:${l.weight};letter-spacing:${l.spacing};${l.upper ? 'text-transform:uppercase;' : ''}line-height:1}
a{color:inherit}
.sign{padding:8px 14px 4px;color:var(--ink);perspective:800px}
.sign .wrap{padding:0}
.lang{display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px}
.lang button{min-width:44px;min-height:44px;border:0;background:none;color:inherit;font:700 14px var(--body);letter-spacing:.06em;opacity:.82;cursor:pointer}
.lang button[aria-pressed="true"]{opacity:1;text-decoration:underline;text-underline-offset:5px}
/* The sign: a Viennese enamel street-sign plate (enamel = --sign-bg, rim and letters = --sign-ink) */
.plate{position:relative;margin:4px 0 0;background:var(--sign-bg);color:var(--sign-ink);border-radius:16px;padding:10px;overflow:hidden;transform-origin:50% -24px;
box-shadow:0 14px 28px color-mix(in srgb,var(--ink) 26%,transparent),inset 0 1px 0 rgba(255,255,255,.22),inset 0 0 0 1px color-mix(in srgb,var(--ink) 14%,transparent);animation:swing 1.4s cubic-bezier(.2,.8,.25,1) both}
.rim{border:3px solid var(--sign-ink);border-radius:10px;padding:20px 12px 18px;text-align:center;container-type:inline-size}
.kind{margin:0 0 8px;font:700 13px/1.25 var(--body);letter-spacing:.22em;text-transform:uppercase;opacity:.92}
.district{margin:9px 0 0;font:700 13px/1.25 var(--body);letter-spacing:.14em;opacity:.88}
.screw{position:absolute;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:color-mix(in srgb,var(--sign-ink) 65%,#8d96a1);box-shadow:inset 0 -1px 1px rgba(0,0,0,.35)}
.screw.l{left:4px}.screw.r{right:4px}
.gleam{position:absolute;top:-40%;bottom:-40%;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transform:skewX(-18deg);pointer-events:none;animation:gleam 1.1s ease-in-out 1.1s both}
h1{font-size:clamp(40px,15vw,80px);line-height:.95;overflow-wrap:anywhere;hyphens:auto}
main.page{animation:rise .7s ease-out .6s both}
.facade{margin:18px 0 0}.facade img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:14px;box-shadow:0 8px 20px color-mix(in srgb,var(--ink) 18%,transparent)}
@keyframes swing{0%{transform:translateY(-115%) rotateX(-50deg)}55%{transform:translateY(0) rotateX(9deg)}75%{transform:rotateX(-3deg)}100%{transform:none}}
@keyframes gleam{0%{left:-60%}100%{left:130%}}
@keyframes rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.plate,.gleam,main.page{animation:none}}
.status{display:flex;align-items:center;gap:10px;margin:18px 0 0;font-weight:700;font-size:18px}
.status::before{content:"";flex:none;width:12px;height:12px;border-radius:50%;background:#8a8a8a}
.status.is-open::before{background:#1e9e4a}
.status.is-closed::before{background:#c8372d}
.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0 0}
.btn{display:flex;align-items:center;justify-content:center;min-height:54px;padding:10px 14px;border:2px solid var(--ink);border-radius:12px;font-weight:700;font-size:18px;text-decoration:none;text-align:center}
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
@media (min-width:700px){.sign{padding:16px 16px 8px}.rim{padding:34px 24px 30px}}
@media (min-width:900px){.wrap{max-width:1080px;padding:0 32px}.sign .wrap{padding:0 32px}.plate{max-width:760px;margin:4px auto 0}.rim{padding:44px 40px 40px}
.page{display:grid;grid-template-columns:minmax(0,1fr) 320px;column-gap:56px;align-items:start}
.col{grid-column:1;grid-row:1}.side{grid-column:2;grid-row:1;position:sticky;top:24px;margin-top:30px;padding:20px;border:2px solid var(--ink);border-radius:8px}
.facade{grid-column:1;grid-row:1}.facade~.col{grid-row:2}.facade~.side{grid-row:1/span 2}
.side .status{margin:0 0 4px}.side .actions{grid-template-columns:1fr}footer{grid-column:1/-1}.photos{grid-template-columns:repeat(3,1fr)}}
`;
}

/** "12., MEIDLING" for a Vienna address (district number from the post code, Vienna's own notation), else the area. */
export function districtLine(v) {
  const a = v.address || {};
  const m = /^1(\d\d)0$/.exec(String(a.zip || ''));
  const n = m ? Number(m[1]) : 0;
  const area = String(v.area || '').toUpperCase();
  if (/^wien$/i.test(String(a.city || '')) && n >= 1 && n <= 23) return area ? `${n}., ${area}` : `${n}. BEZIRK`;
  return area;
}

function sign(v) {
  // The kind above the name says what the place is, so a page with nothing else on it still makes sense.
  const kind = kindLabel(v.kind, 'de') ? tr(kindLabel(v.kind, 'de'), kindLabel(v.kind, 'en'), 'p', 'class="kind"') : '';
  const district = districtLine(v) ? `<p class="district">${esc(districtLine(v))}</p>` : '';
  return `<header class="sign"><div class="wrap">
<div class="lang" role="group" aria-label="Sprache / Language"><button type="button" data-lang="de" lang="de" aria-label="Deutsch" aria-pressed="true">DE</button><button type="button" data-lang="en" lang="en" aria-label="English" aria-pressed="false">EN</button></div>
<div class="plate"><i class="screw l" aria-hidden="true"></i><i class="screw r" aria-hidden="true"></i><div class="rim">${kind}<h1 lang="de"${titleSize(v.name)}>${esc(v.name)}</h1>${district}</div><i class="gleam" aria-hidden="true"></i></div>
</div></header>`;
}

// Google Maps links send an iPhone without the Google app through the App Store; the page script
// swaps in the data-apple link there, so iPhones open Apple Maps, which every iPhone has.
const placeQuery = (v) => encodeURIComponent(`${v.name}, ${v.address.street}, ${v.address.zip} ${v.address.city}`);
const mapAttrs = (google, apple) => `href="${esc(google)}" data-apple="${esc(apple)}"`;
const routeAttrs = (v) => mapAttrs(`https://www.google.com/maps/dir/?api=1&destination=${placeQuery(v)}`, `https://maps.apple.com/?daddr=${placeQuery(v)}`);
const placeAttrs = (v) => mapAttrs(`https://www.google.com/maps/search/?api=1&query=${placeQuery(v)}`, `https://maps.apple.com/?q=${placeQuery(v)}`);

function actions(v) {
  const call = v.phone ? `<a class="btn primary" href="tel:${esc(v.phone)}">${ui('call')}</a>` : '';
  return `<nav class="actions">${call}<a class="btn${v.phone ? '' : ' primary'}" ${routeAttrs(v)} rel="noopener">${ui('route')}</a></nav>`;
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

/** Nasim's photo of the front, under the plate (4:3, cropped on his phone). Only our Blob store or the local preview. */
function facade(v) {
  const u = typeof v.facade === 'string' ? v.facade : '';
  const src = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/venues\/[\w./-]+$/.test(u) ? u : /^__blob\/venues\/[\w./-]+$/.test(u) ? '/' + u : '';
  return src ? `<figure class="facade"><img src="${esc(src)}" alt="${esc(v.name)}" width="1600" height="1200" fetchpriority="high"></figure>` : '';
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
<a ${placeAttrs(v)} rel="noopener">${ui('mapLink')}</a></address></section>`;
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
if(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)){var am=document.querySelectorAll('[data-apple]');for(var m=0;m<am.length;m++)am[m].href=am[m].getAttribute('data-apple')}
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
  if (!pal) throw new Error(`unknown palette "${theme.palette}"`);
  if (!Object.hasOwn(LETTERINGS, theme.lettering)) throw new Error(`unknown lettering "${theme.lettering}"`);
  const let_ = LOOK;
  const v = venue;
  const status = v.hours ? `<p class="status" data-status>${esc(T.de.statusFallback)}</p>` : '';
  return `<!doctype html>
<html lang="de" data-title-de="${esc(titleOf(v, 'de'))}" data-title-en="${esc(titleOf(v, 'en'))}">
<head>
${head(v, pal, let_)}
</head>
<body${owner ? ' class="has-owner"' : ''}>
${sign(v)}
<main class="wrap page">${facade(v)}
<aside class="side">${status}
${actions(v)}</aside><div class="col">
${board(v)}
${facts(v)}
${rating(v)}
${photos(v)}
${hoursTable(v)}
${address(v)}
</div>
${footer(v)}
</main>
${owner ? (owner.css ? `<style>${owner.css}</style>` : '') + owner.html : ''}
${script(v)}${owner && owner.script ? `\n<script>${owner.script}</script>` : ''}
</body>
</html>
`;
}
