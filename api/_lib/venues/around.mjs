// "Around the venue": a small street map the page draws itself (inline SVG, no tiles, no script),
// the nearest stop, other kinds of venues nearby (never the same kind), a few OSM facts, and a medallion on the sign with one pictogram per cuisine or kind.
// Everything comes from v.context, built offline by tools/city/context.mjs. A paying owner's page sets v.context.near = [].
import { kindLabel } from './i18n.mjs';
import { PALETTES, DEFAULT_THEME } from './themes.mjs';
import { CITIES, districtLabel } from './cities.mjs';

import PICTOGRAMS from './pictograms.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Same as the template's: text that switches with the language toggle.
const tr = (de, en, tag = 'span', attrs = '') =>
  `<${tag}${attrs ? ' ' + attrs : ''} data-de="${esc(de)}" data-en="${esc(en)}">${esc(de)}</${tag}>`;

export const FACT_LABELS = {
  terrace: ['Schanigarten / Terrasse', 'Outdoor seating'],
  wheelchair: ['Rollstuhlgerecht', 'Wheelchair accessible'],
  wheelchairLimited: ['Teilweise rollstuhlgerecht', 'Partly wheelchair accessible'],
  takeaway: ['Zum Mitnehmen', 'Takeaway'],
  delivery: ['Lieferung', 'Delivery'],
  vegan: ['Vegane Auswahl', 'Vegan options'],
  vegetarian: ['Vegetarische Auswahl', 'Vegetarian options'],
  cards: ['Kartenzahlung', 'Cards accepted'],
  wifi: ['WLAN', 'Wi-Fi'],
  dog: ['Hunde willkommen', 'Dogs welcome'],
  aircon: ['Klimatisiert', 'Air-conditioned'],
  highchair: ['Kinderhochstuhl', 'High chairs'],
  reservation: ['Reservierung möglich', 'Reservations'],
};
// OSM cuisine values we name on the page; anything else is left out rather than shown raw.
export const CUISINE = {
  kebab: ['Kebab', 'Kebab'], pizza: ['Pizza', 'Pizza'], italian_pizza: ['Pizza', 'Pizza'], burger: ['Burger', 'Burgers'],
  wrap: ['Wraps', 'Wraps'], pasta: ['Pasta', 'Pasta'], italian: ['Italienisch', 'Italian'], asian: ['Asiatisch', 'Asian'],
  chinese: ['Chinesisch', 'Chinese'], japanese: ['Japanisch', 'Japanese'], sushi: ['Sushi', 'Sushi'], thai: ['Thailändisch', 'Thai'],
  vietnamese: ['Vietnamesisch', 'Vietnamese'], indian: ['Indisch', 'Indian'], korean: ['Koreanisch', 'Korean'], ramen: ['Ramen', 'Ramen'],
  noodle: ['Nudeln', 'Noodles'], turkish: ['Türkisch', 'Turkish'], greek: ['Griechisch', 'Greek'], balkan: ['Balkan', 'Balkan'],
  arab: ['Arabisch', 'Arabic'], oriental: ['Orientalisch', 'Middle Eastern'], persian: ['Persisch', 'Persian'], mexican: ['Mexikanisch', 'Mexican'],
  american: ['Amerikanisch', 'American'], french: ['Französisch', 'French'], mediterranean: ['Mediterran', 'Mediterranean'],
  regional: ['Regional', 'Regional'], austrian: ['Österreichisch', 'Austrian'], local: ['Regional', 'Local'], schnitzel: ['Schnitzel', 'Schnitzel'],
  sausage: ['Würstel', 'Sausages'], hot_dog: ['Hot Dogs', 'Hot dogs'], chicken: ['Hendl', 'Chicken'], fish: ['Fisch', 'Fish'],
  grill: ['Grill', 'Grill'], barbecue: ['Grill', 'Barbecue'], steak_house: ['Steaks', 'Steaks'], sandwich: ['Sandwiches', 'Sandwiches'],
  toast: ['Toast', 'Toast'], salad: ['Salate', 'Salads'], breakfast: ['Frühstück', 'Breakfast'], cake: ['Kuchen', 'Cakes'],
  ice_cream: ['Eis', 'Ice cream'], coffee_shop: ['Kaffee', 'Coffee'], bubble_tea: ['Bubble Tea', 'Bubble tea'], heuriger: ['Heuriger', 'Heuriger'],
  buschenschank: ['Buschenschank', 'Buschenschank'], falafel: ['Falafel', 'Falafel'], pide: ['Pide', 'Pide'], durum: ['Dürüm', 'Dürüm'], dürüm: ['Dürüm', 'Dürüm'], doner: ['Döner', 'Döner'],
  dumpling: ['Dumplings', 'Dumplings'], donut: ['Donuts', 'Donuts'], waffle: ['Waffeln', 'Waffles'], bagel: ['Bagels', 'Bagels'],
  soup: ['Suppen', 'Soups'], tea: ['Tee', 'Tea'], juice: ['Säfte', 'Juices'], seafood: ['Meeresfrüchte', 'Seafood'],
};

// The medallion on the sign: one pictogram (our generated enamel-sign set, api/_lib/venues/pictograms.mjs)
// chosen by the venue's first known cuisine, else by its kind.
const KIND_ICON = { friseur: 'scissors', cafe: 'cafe', restaurant: 'restaurant', imbiss: 'restaurant', handy: 'handy', nails: 'nails', kosmetik: 'kosmetik', schneider: 'sewing-machine' };
const CUISINE_ICON = {
  kebab: 'kebab', doner: 'kebab', pide: 'kebab', turkish: 'kebab', durum: 'wrap', 'dürüm': 'wrap', wrap: 'wrap', falafel: 'falafel',
  pizza: 'pizza', italian_pizza: 'pizza', italian: 'pizza', burger: 'burger', sausage: 'sausage', hot_dog: 'sausage',
  asian: 'asian', thai: 'asian', vietnamese: 'asian', korean: 'asian', ramen: 'asian', noodle: 'asian', chinese: 'dumplings', dumpling: 'dumplings',
  japanese: 'sushi', sushi: 'sushi', coffee_shop: 'cafe', ice_cream: 'ice-cream', breakfast: 'breakfast', chicken: 'chicken',
  schnitzel: 'schnitzel', escalope: 'schnitzel', salad: 'salad', bubble_tea: 'bubble-tea', heuriger: 'wine', buschenschank: 'wine', cake: 'cake',
  indian: 'curry', mexican: 'taco', steak_house: 'steak', fish: 'fish', seafood: 'fish', sandwich: 'sandwich', toast: 'sandwich',
  donut: 'donut', waffle: 'waffle', bagel: 'bagel', soup: 'soup', tea: 'tea', juice: 'juice',
};
const FACT_ICON = { terrace: 'terrace', wheelchair: 'wheelchair', wheelchairLimited: 'wheelchair', takeaway: 'takeaway', delivery: 'delivery', vegan: 'vegan', vegetarian: 'vegan', cards: 'card', wifi: 'wifi',
  dog: 'dog-friendly', aircon: 'snowflake', highchair: 'high-chair', reservation: 'reservation' };
const STOP_ICON = { u: 'subway', s: 'train', tram: 'tram', bus: 'bus' };
/** Every pictogram name the pages can ask for (kept honest by a test against pictograms.mjs). */
export const iconNames = () => [...new Set([...Object.values(KIND_ICON), ...Object.values(CUISINE_ICON), ...Object.values(FACT_ICON), ...Object.values(STOP_ICON)])];
// Dish words in a food venue's own name (what its sign says) beat the OSM cuisine, which is often off:
// "Baki's Schnitzelparadies" is tagged chicken. The earliest word in the name wins.
const FOOD_KINDS = new Set(['imbiss', 'restaurant', 'cafe']);
const NAME_ICON = [
  [/schnitzel/, 'schnitzel'], [/keba[bp]|d[oö]ner/, 'kebab'], [/d[uü]r[uü]m|\bwraps?\b/, 'wrap'], [/pizz/, 'pizza'], [/burger/, 'burger'],
  [/sushi/, 'sushi'], [/falafel/, 'falafel'], [/bagel/, 'bagel'], [/donut|doughnut/, 'donut'], [/waffel|waffle/, 'waffle'],
  [/\bwok\b|asia|ramen|\bpho\b/, 'asian'], [/taco|burrito|mexi/, 'taco'], [/curry|indian|india\b/, 'curry'], [/steak/, 'steak'],
  [/fisch|\bfish/, 'fish'], [/hendl|chicken|gefl[uü]gel/, 'chicken'], [/w[uü]rstel|wurst|hot ?dog/, 'sausage'], [/\beis\b|gelato|eissalon/, 'ice-cream'],
  [/heurig|buschenschank/, 'wine'], [/bubble ?tea/, 'bubble-tea'], [/fr[uü]hst[uü]ck|breakfast/, 'breakfast'], [/suppe|\bsoup/, 'soup'], [/sandwich/, 'sandwich'],
];
function nameIcon(name) {
  const s = String(name || '').toLowerCase();
  let best = null;
  for (const [re, icon] of NAME_ICON) { const m = re.exec(s); if (m && (!best || m.index < best.at)) best = { at: m.index, icon }; }
  return best ? best.icon : '';
}
/** The browser-tab icon: the venue's medallion pictogram on a disc in its sign colours (a pin when no pictogram fits). */
export function faviconSvg(v) {
  const pal = PALETTES[(v.theme && v.theme.palette) || DEFAULT_THEME.palette] || PALETTES[DEFAULT_THEME.palette];
  const d = PICTOGRAMS[medalIcon(v)] || PICTOGRAMS.pin;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${pal.signBg}"/>` +
    `<path fill="${pal.signInk}" fill-rule="evenodd" d="${d}" transform="translate(11 11) scale(.78)"/></svg>`;
}

/** The pictogram name for a venue's medallion (dish word in the name, then cuisine, then kind), or '' when none fits. */
export function medalIcon(v) {
  const n = FOOD_KINDS.has(v.kind) ? nameIcon(v.name) : '';
  if (n) return n;
  const c = ((v.context && v.context.cuisine) || []).find((x) => CUISINE_ICON[x]);
  return c ? CUISINE_ICON[c] : KIND_ICON[v.kind] || '';
}
export const pictogram = (name, size, cls = '') => PICTOGRAMS[name]
  ? `<svg viewBox="0 0 100 100" width="${size}" height="${size}"${cls ? ` class="${cls}"` : ''} aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${PICTOGRAMS[name]}"/></svg>` : '';
export function medal(v) {
  const n = medalIcon(v);
  return n ? `<div class="medal">${pictogram(n, 44)}</div>` : '';
}

export const AROUND_CSS = `
.vista{margin:0 0 14px}.vista i{display:block;aspect-ratio:16/8;background:var(--accent);-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}
.vista figcaption{margin-top:6px;text-align:center;font:600 13px/1.3 var(--body);letter-spacing:.04em;opacity:.7}
.medal{display:grid;place-items:center;width:66px;height:66px;margin:-4px auto 10px;color:var(--sign-ink);border:2px solid var(--sign-ink);border-radius:50%;box-shadow:0 0 0 3px var(--sign-bg),0 0 0 4.5px var(--sign-ink)}
@media (min-width:700px){.medal{width:78px;height:78px}.medal svg{width:52px;height:52px}}
.facts li.food{background:var(--ink);color:var(--bg)}
.facts li{display:inline-flex;align-items:center;gap:7px}.facts li svg{flex:none}
.map{margin:0;border:2px solid var(--accent);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--sign-bg) 7%,var(--bg))}
.map svg{display:block;width:100%;height:auto}
.map .st{fill:none;stroke:color-mix(in srgb,var(--ink) 22%,transparent);stroke-width:11;stroke-linecap:round;stroke-linejoin:round}
.map .st.big{stroke-width:18;stroke:color-mix(in srgb,var(--ink) 30%,transparent)}
.map text{font:700 17px var(--body);fill:color-mix(in srgb,var(--ink) 70%,transparent);letter-spacing:.04em;paint-order:stroke;stroke:color-mix(in srgb,var(--sign-bg) 7%,var(--bg));stroke-width:5px}
.map .dot{fill:color-mix(in srgb,var(--ink) 38%,transparent)}
.map .me{fill:var(--accent);stroke:var(--ink);stroke-width:2}
.map .ring{fill:none;stroke:var(--accent);stroke-width:2;transform-origin:center;transform-box:fill-box;animation:ping 2.4s ease-out 1.4s 3}
.map .stop rect{fill:var(--accent)}.map .stop path{fill:var(--accent-ink)}
.map figcaption{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid color-mix(in srgb,var(--ink) 18%,transparent);font-size:15px}
.badge{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:var(--accent);color:var(--accent-ink)}
.near{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.near a{display:flex;flex-direction:column;justify-content:space-between;gap:6px;min-height:118px;padding:12px;border:2px solid color-mix(in srgb,var(--accent) 75%,transparent);border-radius:10px;text-decoration:none;background:var(--bg)}
.near .mini{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px color-mix(in srgb,var(--ink) 55%,transparent)}
.near b{font-size:16px;line-height:1.2;overflow-wrap:anywhere}
.near small{font-size:13px;opacity:.75}
.near a:hover{border-color:var(--accent)}
@keyframes ping{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(3.2)}}
@media (prefers-reduced-motion:reduce){.map .ring{animation:none;opacity:0}}
@media (min-width:900px){.near{grid-template-columns:repeat(3,1fr)}}
`;

/** OSM fact chips (added to the facts list). */
export function contextFacts(v) {
  const c = v.context || {};
  const seen = new Set();
  const food = (c.cuisine || []).map((k) => CUISINE[k]).filter((x) => x && !seen.has(x[0]) && seen.add(x[0]))
    .map(([de, en]) => tr(de, en, 'li', 'class="food"'));
  const chip = (de, en, icon, cls) => `<li${cls ? ` class="${cls}"` : ''}>${pictogram(icon, 20)}${tr(de, en)}</li>`;
  return [...food, ...(c.facts || []).filter((k) => FACT_LABELS[k]).map((k) => chip(FACT_LABELS[k][0], FACT_LABELS[k][1], FACT_ICON[k]))];
}

function mapSvg(c, v) {
  const m = c.map;
  const cx = m.w / 2, cy = m.h / 2;
  const streets = m.streets.map((s) => `<path class="st${s.big ? ' big' : ''}" d="${s.d}"/>`).join('');
  let labels = '', defs = '', n = 0;
  for (const s of m.streets.filter((x) => x.label && x.name).sort((a, b) => b.big - a.big).slice(0, 6)) {
    const id = `sl${n++}`;
    defs += `<path id="${id}" d="${s.label}"/>`;
    labels += `<text><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(s.name)}</textPath></text>`;
  }
  const dots = m.dots.map(([x, y]) => `<circle class="dot" cx="${x}" cy="${y}" r="5"/>`).join('');
  const pals = (x) => PALETTES[x.palette] || PALETTES['black-white'];
  const named = (c.near || []).filter((x) => x.xy && x.icon && PICTOGRAMS[x.icon]).map((x) => {
    const [px, py] = x.xy, p = pals(x);
    return `<g><circle cx="${px}" cy="${py}" r="17" fill="${p.signBg}" stroke="${p.signInk}" stroke-width="2"/><path transform="translate(${px - 11} ${py - 11}) scale(.22)" fill="${p.signInk}" fill-rule="evenodd" d="${PICTOGRAMS[x.icon]}"/></g>`;
  }).join('');
  let stop = '';
  if (c.stop && c.stop.xy) {
    const [x, y] = c.stop.xy, p = PICTOGRAMS[STOP_ICON[c.stop.type]];
    stop = `<g class="stop"><rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="7"/>${p ? `<path transform="translate(${x - 11} ${y - 11}) scale(.22)" fill-rule="evenodd" d="${p}"/>` : ''}</g>`;
  }
  return `<svg viewBox="0 0 ${m.w} ${m.h}" role="img" aria-label="${esc(`Lageplan: ${v.name}, ${v.address.street}`)}"><defs>${defs}</defs>${streets}${labels}${dots}${named}${stop}<circle class="ring" cx="${cx}" cy="${cy}" r="12"/><circle class="me" cx="${cx}" cy="${cy}" r="12"/></svg>`;
}

// One linocut landmark per Vienna district and per other city (v/_shared/districts/<key>.webp, a transparent mask
// tinted with the page's accent colour). The label is the landmark, for screen readers.
const LANDMARKS = {
  'wien-01': 'Stephansdom', 'wien-02': 'Riesenrad im Prater', 'wien-03': 'Belvedere', 'wien-04': 'Karlskirche', 'wien-05': 'Gemeindebau in Margareten',
  'wien-06': 'Flakturm im Esterházypark', 'wien-07': 'Spittelberg', 'wien-08': 'Piaristenkirche Maria Treu', 'wien-09': 'Votivkirche',
  'wien-10': 'Wasserturm Favoriten', 'wien-11': 'Gasometer', 'wien-12': 'Markt in Meidling', 'wien-13': 'Gloriette', 'wien-14': 'Kirche am Steinhof',
  'wien-15': 'Westbahnhof', 'wien-16': 'Schloss Wilhelminenberg', 'wien-17': 'Wienerwald', 'wien-18': 'Türkenschanzpark', 'wien-19': 'Weingärten am Kahlenberg',
  'wien-20': 'Millennium Tower', 'wien-21': 'Floridsdorfer Brücke', 'wien-22': 'Donauturm', 'wien-23': 'Wotrubakirche',
  graz: 'Uhrturm am Schlossberg', linz: 'Pöstlingberg', salzburg: 'Festung Hohensalzburg', innsbruck: 'Goldenes Dachl',
  'graz-01': 'Uhrturm am Schlossberg', 'graz-02': 'Leonhardkirche', 'graz-03': 'Universität Graz', 'graz-04': 'Kunsthaus Graz', 'graz-05': 'Straßenbahn in Gries',
  'graz-06': 'Augarten an der Mur', 'graz-07': 'Stadion Liebenau', 'graz-08': 'Pfarrkirche St. Peter', 'graz-09': 'Villen am Ruckerlberg', 'graz-10': 'Hügel in Ries',
  'graz-11': 'Basilika Mariatrost', 'graz-12': 'Kirche in Andritz', 'graz-13': 'Burgruine Gösting', 'graz-14': 'Schloss Eggenberg', 'graz-15': 'Kapelle in Wetzelsdorf',
  'graz-16': 'Pfarrkirche Straßgang', 'graz-17': 'Brauerei in Puntigam',
};
const ART_FILE = { 'graz-01': 'graz' }; // Innere Stadt keeps the city picture
/** { key, where } for the venue's area: Vienna by post code, Graz by district name, other cities by name; null when none. */
function artKey(v) {
  const a = v.address || {};
  const city = String(a.city || '').toLowerCase();
  if (city === 'wien') {
    const m = /^1(\d\d)0$/.exec(String(a.zip || ''));
    return m && +m[1] >= 1 && +m[1] <= 23 ? { key: `wien-${m[1]}`, where: districtLabel('wien', +m[1]) } : null;
  }
  const table = CITIES[city] && CITIES[city].districts;
  const d = table && Object.keys(table).find((n) => table[n] === v.area);
  if (d && LANDMARKS[`${city}-${String(d).padStart(2, '0')}`]) return { key: `${city}-${String(d).padStart(2, '0')}`, where: districtLabel(city, d) };
  return LANDMARKS[city] ? { key: city, where: CITIES[city].name } : null;
}
/** The district illustration block, or '' when the venue's area has none. */
export function districtArt(v) {
  const k = artKey(v);
  if (!k) return '';
  const u = `/v/_shared/districts/${ART_FILE[k.key] || k.key}.webp`;
  const name = LANDMARKS[k.key];
  // The caption names the district first, so the landmark reads as the district's emblem, not as something next door.
  return `<figure class="vista"><i role="img" aria-label="${esc(name)}" style="-webkit-mask-image:url(${u});mask-image:url(${u})"></i><figcaption>${esc(k.where)} · ${esc(name)}</figcaption></figure>`;
}

export function aroundSections(v) {
  const c = v.context;
  if (!c || !c.map) return '';
  let cap = '';
  if (c.stop) {
    cap = `<figcaption><span class="badge">${pictogram(STOP_ICON[c.stop.type], 24)}</span>${tr(`${c.stop.name} · ${c.stop.min} Min. zu Fuß`, `${c.stop.name} · ${c.stop.min} min walk`)}</figcaption>`;
  }
  const map = `<section>${tr('Rundherum', 'Around', 'h2')}${districtArt(v)}<figure class="map">${mapSvg(c, v)}${cap}</figure></section>`;
  const near = (c.near || []).length ? `<section>${tr('In der Nähe', 'Nearby', 'h2')}<ul class="near">${c.near.map((x) =>
    `<li><a href="https://${esc(x.slug)}.namax.at/">${x.icon && PICTOGRAMS[x.icon] ? `<i class="mini" style="background:${(PALETTES[x.palette] || PALETTES['black-white']).signBg};color:${(PALETTES[x.palette] || PALETTES['black-white']).signInk}">${pictogram(x.icon, 24)}</i>` : ''}<b>${esc(x.name)}</b>${tr(`${kindLabel(x.kind, 'de')} · ${x.m} m`, `${kindLabel(x.kind, 'en')} · ${x.m} m`, 'small')}</a></li>`).join('')}</ul></section>` : '';
  return map + near;
}
