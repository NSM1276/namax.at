// The "Symbolbild" of a venue's trade, shown where the facade photo would be until the owner sends real photos.
// Only tools of the trade or a dish, never a room, so nobody takes it for the place itself.
// Food follows the OSM cuisine. With no known cuisine we never guess a dish: a restaurant gets a laid table,
// an imbiss a takeaway bag (NEUTRAL).
// Pictures: v/_shared/niche/<name>.webp (dark still lifes from the design library, cropped 4:3 around the subject, 1024x768).

export const NICHE = {
  friseur: ['hair', 'barber', 'barber-scissors', 'barber-clipper', 'barber-razor', 'hair-dryer'],
  nails: ['nails', 'nail-polish', 'nail-tools'],
  kosmetik: ['cosmetics', 'cosmetics-jars', 'makeup-brushes', 'jade-roller'],
  schneider: ['tailor', 'tailor-tape', 'tailor-shears', 'sewing-machine'],
  cafe: ['coffee', 'cake', 'breakfast', 'cappuccino', 'croissant', 'sachertorte'],
  handy: ['phone-repair', 'phone-accessories'],
};

// Food with no known cuisine: no dish, only the table or the bag.
export const NEUTRAL = {
  restaurant: ['table-setting', 'table-setting-2', 'table-setting-3'],
  imbiss: ['takeaway', 'takeaway-2', 'takeaway-3'],
};

// OSM cuisine values (lower case) → pictures. Used for restaurant and imbiss.
export const CUISINE = {
  pizza: ['pizza', 'pizza-2', 'pizza-3'],
  italian_pizza: ['pizza', 'pizza-2', 'pizza-3'],
  italian: ['pasta', 'pizza-2', 'carbonara', 'lasagne'],
  kebab: ['doener', 'dueruem', 'kebab', 'adana'],
  doner: ['doener', 'dueruem'],
  turkish: ['lahmacun', 'pide', 'adana'],
  sushi: ['sushi', 'sushi-2'],
  japanese: ['sushi', 'ramen'],
  ramen: ['ramen'],
  noodle: ['ramen'],
  indian: ['curry'],
  pakistani: ['curry'],
  curry: ['curry'],
  burger: ['burger'],
  american: ['burger'],
  austrian: ['schnitzel', 'schnitzel-2', 'goulash', 'tafelspitz', 'kaesespaetzle'],
  regional: ['schnitzel', 'schnitzel-2', 'goulash', 'tafelspitz', 'kaesespaetzle'],
  local: ['schnitzel', 'schnitzel-2', 'goulash', 'tafelspitz'],
  schnitzel: ['schnitzel', 'schnitzel-2'],
  escalope: ['schnitzel', 'schnitzel-2'],
  sausage: ['wuerstel'],
  asian: ['asian-wok', 'spring-rolls'],
  chinese: ['asian-wok', 'dumplings', 'spring-rolls'],
  dumpling: ['dumplings'],
  vietnamese: ['pho', 'spring-rolls'],
  thai: ['thai-curry'],
  korean: ['bibimbap'],
  nepalese: ['momo'],
  tibetan: ['momo'],
  greek: ['gyros'],
  mexican: ['tacos', 'mexican-bowl'],
  tex_mex: ['tacos', 'mexican-bowl'],
  chicken: ['chicken', 'fried-chicken'],
  fried_chicken: ['fried-chicken'],
  fish: ['fish'],
  seafood: ['fish'],
  persian: ['persian'],
  iranian: ['persian'],
  barbecue: ['bbq-ribs'],
  bbq: ['bbq-ribs'],
  oriental: ['falafel', 'hummus'],
  balkan: ['cevapi'],
  serbian: ['cevapi'],
  bosnian: ['cevapi'],
  croatian: ['cevapi'],
  cevapi: ['cevapi'],
  falafel: ['falafel', 'hummus'],
  lebanese: ['falafel', 'hummus'],
  syrian: ['falafel', 'hummus'],
  arab: ['falafel', 'hummus'],
  middle_eastern: ['falafel', 'hummus'],
  steak_house: ['steak'],
  steak: ['steak'],
  heuriger: ['wine'],
  buschenschank: ['wine'],
  wine: ['wine'],
};
const FOOD = new Set(['restaurant', 'imbiss']);

/** Stable small hash, so a page keeps its picture and neighbours of one trade differ. */
function pick(list, slug) {
  let h = 2166136261;
  for (const c of String(slug)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return list[(h >>> 0) % list.length];
}

/** → '/v/_shared/niche/<name>.webp' | null */
export function nicheImage(v) {
  let list = NICHE[v.kind];
  if (FOOD.has(v.kind)) {
    list = NEUTRAL[v.kind];
    const tokens = typeof v.cuisine === 'string' ? v.cuisine.toLowerCase().split(/[;,]/).map((s) => s.trim()) : [];
    for (const t of tokens) if (Object.hasOwn(CUISINE, t)) { list = CUISINE[t]; break; }
  }
  return list ? `/v/_shared/niche/${pick(list, v.slug)}.webp` : null;
}
