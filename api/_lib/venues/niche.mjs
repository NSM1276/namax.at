// The "Symbolbild" of a venue's trade, shown where the facade photo would be until the owner sends real photos.
// Rule (Nasim, 2026-11-25): the picture shows only what this venue surely sells or does. When we don't know that,
// there is no picture: an empty frame is better than a paper bag at a Buffet or a razor at a ladies' salon.
// Only tools of the trade or a dish, never a room, so nobody takes it for the place itself.
// Order: a dish or trade word in the venue's own name (its sign) → the OSM cuisine → a safe default for the kind.
// A word we know but have no picture for (Donut, Buffet, Kiosk ...) means no picture, not a guess.
// Pictures: v/_shared/niche/<name>.webp (dark still lifes from the design library, 4:3, 1024x768).

const HAIR = ['hair', 'hair-dryer', 'barber-scissors', 'hair-colour', 'hair-care', 'hair-clips'];
const BARBER = ['barber', 'barber-razor', 'barber-clipper', 'barber-scissors', 'beard-care'];
const COFFEE = ['coffee', 'cappuccino', 'coffee-beans'];
const CAKE = ['cake', 'sachertorte', 'pastries'];
const KAFFEEHAUS = ['coffee', 'cappuccino', 'sachertorte'];
const BREAKFAST = ['breakfast', 'croissant'];
const AUSTRIAN = ['schnitzel', 'schnitzel-2', 'goulash'];
const GELATO = ['gelato-cups', 'sundae'];
const TEA = ['tea'];
const BOWL = ['buddha-bowl'];
const PIZZA = ['pizza-2', 'pizza-3'];
// An Austrian kebab shop sells Döner in bread and Dürüm; Adana skewers only in a Turkish grill restaurant (Nasim 2026-11-24).
const KEBAB = ['doener', 'dueruem', 'kebab'];
// Steak and wine pictures were dropped on 2026-11-24 (steak sat at the frame's edge, the wine shot showed a cellar);
// until new ones come, a steakhouse or Heuriger gets the laid table, which is true for any restaurant.
const TABLE = ['table-setting', 'table-setting-2', 'table-setting-3'];

/** Trades: the default when the name says nothing more. */
export const NICHE = {
  friseur: HAIR,
  nails: ['nails', 'nail-polish', 'nail-tools'],
  kosmetik: ['cosmetics-jars', 'jade-roller', 'face-mask'],
  schneider: ['tailor', 'tailor-tape', 'tailor-shears', 'sewing-machine'],
  cafe: COFFEE,
  handy: ['phone-repair', 'phone-accessories'],
};

/** A restaurant with no known cuisine: a laid table says "you eat here", true for every restaurant. An imbiss gets nothing. */
export const NEUTRAL = { restaurant: TABLE };

// Words in the name, per kind group; the earliest match in the name wins. null = we know it, but have no true picture.
const NAME_FOOD = [
  [/schnitzel/, AUSTRIAN.slice(0, 2)], [/keba[bp]|d[oö]ner/, KEBAB], [/d[uü]r[uü]m/, ['dueruem']],
  [/pizz/, PIZZA], [/burger/, ['burger']], [/sushi/, ['sushi', 'sushi-2']], [/falafel/, ['falafel', 'hummus']],
  [/lahmacun/, ['lahmacun']], [/\bpide/, ['pide']], [/[cć]evap/, ['cevapi']], [/gyros/, ['gyros']], [/ramen/, ['ramen']], [/\bpho\b/, ['pho']],
  [/\bwok\b/, ['asian-wok']], [/momo/, ['momo']], [/taco|burrito|mexi/, ['tacos', 'mexican-bowl']], [/curry/, ['curry']], [/steak(?!\s*d[oö]ner)/, TABLE],
  [/fisch|\bfish/, ['fish']], [/hendl|chicken|gefl[uü]gel/, ['chicken', 'fried-chicken']], [/w[uü]rstel|wurst/, ['wuerstel']],
  [/heurig|buschenschank/, TABLE], [/br[aä]u\b|brauerei|brewing|brewery|bierhaus/, ['beer-pretzel']], [/fr[uü]hst[uü]ck|breakfast|brunch/, BREAKFAST],
  [/konditor|patisser|torten|b[aä]cker/, CAKE],
  [/\beis\b|eiscaf|eissalon|gelat|ice ?cream/, GELATO], [/bubble|boba/, ['bubble-tea']], [/matcha/, ['matcha']],
  [/(?:\btee\b|\btea\b|teehaus|teestube)(?!.*(?:bubble|boba))/, TEA], [/juice|\bs[aä]fte?\b|smoothie/, ['juice']], [/bagel/, ['bagel']],
  [/cr[eêè]pe|palatschink/, ['crepe']], [/waffel|waffle/, ['waffle']], [/hot ?dog/, ['hot-dog']], [/panini|sandwich|\btoast/, ['panini']],
  [/fries|pommes/, ['fries']], [/\bpok[eé](?![a-z])/, ['poke']], [/a[cç]a[ií]/, ['acai']], [/\bbowls?\b/, BOWL], [/tapas/, ['tapas']],
  [/[ck]hinkali|chinkali/, ['khinkali']], [/pierog|pirogg|wareniki|vareniki/, ['pierogi']], [/empanad/, ['empanadas']],
  [/tajine|tagine/, ['tagine']], [/injera/, ['injera']],
  [/donut|buffet|kiosk/, null],
];
const PEDICURE = [/fu(?:ß|ss)pflege|pedik[uü]r|pedicure|podolog/, ['pedicure']];
const NAME_NAILS = [PEDICURE];
const NAME_FRISEUR = [[/barber|barbier|herren|\bmen\b|men'?s|gentlem|bart/, BARBER]];
const NAME_KOSMETIK = [PEDICURE, [/nail|n[aä]gel/, ['nails', 'nail-polish', 'nail-tools']], [/brow|lash|wimper|augenbrau/, ['brow-lash']],
  [/massage/, ['massage']], [/tattoo|piercing/, null]];
const NAME_RULES = { imbiss: NAME_FOOD, restaurant: NAME_FOOD, cafe: NAME_FOOD, friseur: NAME_FRISEUR, kosmetik: NAME_KOSMETIK, nails: NAME_NAILS };

// OSM cuisine values (lower case) → pictures. Only the FIRST value decides ("french;italian" is not Italian);
// a first value we have no picture for gives the kind's neutral picture or none. null = known, no true picture.
export const CUISINE = {
  pizza: PIZZA, italian_pizza: PIZZA, italian: ['pasta', 'carbonara', 'pizza-2'],
  kebab: KEBAB, doner: ['doener', 'dueruem'], turkish: ['lahmacun', 'pide', 'adana'],
  sushi: ['sushi', 'sushi-2'], japanese: ['sushi', 'ramen'], ramen: ['ramen'], noodle: ['ramen'],
  indian: ['curry'], pakistani: ['curry'], curry: ['curry'], burger: ['burger'], american: ['burger'],
  austrian: AUSTRIAN, regional: AUSTRIAN, local: AUSTRIAN, viennese: AUSTRIAN, schnitzel: AUSTRIAN.slice(0, 2), escalope: AUSTRIAN.slice(0, 2),
  sausage: ['wuerstel'], sausages: ['wuerstel'],
  balkan: ['cevapi'], serbian: ['cevapi'], bosnian: ['cevapi'], croatian: ['cevapi'], cevapi: ['cevapi'],
  falafel: ['falafel', 'hummus'], lebanese: ['falafel', 'hummus'], syrian: ['falafel', 'hummus'], arab: ['falafel', 'hummus'],
  middle_eastern: ['falafel', 'hummus'], oriental: ['falafel', 'hummus'], israeli: ['hummus', 'falafel'],
  steak_house: TABLE, steak: TABLE, heuriger: TABLE, buschenschank: TABLE, wine: TABLE,
  asian: ['asian-wok', 'spring-rolls'], chinese: ['asian-wok', 'dumplings', 'spring-rolls'], dumpling: ['dumplings'],
  vietnamese: ['pho', 'spring-rolls'], thai: ['thai-curry'], korean: ['bibimbap'], nepalese: ['momo'], tibetan: ['momo'],
  greek: ['gyros'], mexican: ['tacos', 'mexican-bowl'], tex_mex: ['tacos', 'mexican-bowl'],
  chicken: ['chicken', 'fried-chicken'], fried_chicken: ['fried-chicken'], fish: ['fish'], seafood: ['fish'],
  persian: ['persian'], iranian: ['persian'], barbecue: ['bbq-ribs'], bbq: ['bbq-ribs'],
  breakfast: BREAKFAST, brunch: BREAKFAST,
  // cafés
  coffee_shop: COFFEE, coffee: COFFEE, cake: CAKE, pastry: CAKE, confiserie: CAKE, dessert: CAKE,
  ice_cream: GELATO, ice: GELATO, gelato: GELATO, frozen_yogurt: null, bubble_tea: ['bubble-tea'], tea: ['tea'], teahouse: ['tea'],
  matcha: ['matcha'], juice: ['juice'], smoothie: ['juice'], bagel: ['bagel'], waffle: ['waffle'], crepe: ['crepe'],
  hot_dog: ['hot-dog'], sandwich: ['panini'], panini: ['panini'], toast: ['panini'], fries: ['fries'], donut: null,
  poke: ['poke'], poke_bowl: ['poke'], hawaiian: ['poke'], acai: ['acai'], bowl: ['buddha-bowl'], spanish: ['tapas'], tapas: ['tapas'],
  georgian: ['khinkali'], polish: ['pierogi'], ukrainian: ['pierogi'], afghan: ['kabuli-pulao'], ethiopian: ['injera'], eritrean: ['injera'],
  moroccan: ['tagine'], empanada: ['empanadas'], fine_dining: ['fine-dining'],
};
// A Viennese Kaffeehaus (austrian / regional cuisine on a café) is coffee and cake; Schnitzel would be a guess.
const CAFE_CUISINE = { austrian: KAFFEEHAUS, regional: KAFFEEHAUS, viennese: KAFFEEHAUS, local: KAFFEEHAUS };
// A Turkish imbiss is a döner stand, not a grill: no Adana, Pide or Lahmacun guess.
const IMBISS_CUISINE = { turkish: KEBAB };
const KIND_CUISINE = { cafe: CAFE_CUISINE, imbiss: IMBISS_CUISINE };
const FOOD = new Set(['restaurant', 'imbiss', 'cafe']);
// A vague word on the sign gives way to a more exact first cuisine: 'Red Bowl' (chinese) is a wok, 'Tea Plus' (bubble_tea) is bubble tea.
const YIELDS = new Map([[BOWL, new Set(['asian', 'chinese', 'japanese', 'korean', 'vietnamese', 'thai', 'hawaiian', 'poke', 'poke_bowl'])], [TEA, new Set(['bubble_tea'])]]);

/** Stable small hash, so a page keeps its picture and neighbours of one trade differ. */
function pick(list, slug) {
  let h = 2166136261;
  for (const c of String(slug)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return list[(h >>> 0) % list.length];
}

/** → { list } for the earliest rule word in the name (list may be null), or undefined when the name says nothing. */
function byName(rules, name) {
  const s = String(name || '').toLowerCase();
  let best;
  for (const [re, list] of rules || []) { const m = re.exec(s); if (m && (!best || m.index < best.at)) best = { at: m.index, list }; }
  return best;
}

/** The picture list for a venue, or null when we don't know what it surely sells. */
export function nicheList(v) {
  const tokens = typeof v.cuisine === 'string' ? v.cuisine.toLowerCase().split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [];
  const t = tokens[0];
  const named = byName(NAME_RULES[v.kind], v.name);
  if (named && !(YIELDS.get(named.list)?.has(t) && CUISINE[t])) return named.list;
  if (!FOOD.has(v.kind)) return NICHE[v.kind] || null;
  const own = KIND_CUISINE[v.kind];
  if (t && own && Object.hasOwn(own, t)) return own[t];
  if (t && Object.hasOwn(CUISINE, t)) return CUISINE[t];
  return v.kind === 'cafe' ? NICHE.cafe : NEUTRAL[v.kind] || null;
}

/** → '/v/_shared/niche/<name>.webp' | null */
export function nicheImage(v) {
  const list = nicheList(v);
  return list && list.length ? `/v/_shared/niche/${pick(list, v.slug)}.webp` : null;
}

/** Every picture name the tables can give (the test checks each file exists). */
export const allNicheNames = () => [...new Set([...Object.values(NICHE), ...Object.values(NEUTRAL), ...Object.values(CUISINE), ...Object.values(CAFE_CUISINE), ...Object.values(IMBISS_CUISINE),
  ...Object.values(NAME_RULES).flatMap((r) => r.map((x) => x[1]))].flat().filter(Boolean))];
