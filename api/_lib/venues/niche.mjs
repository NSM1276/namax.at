// The "Symbolbild" of a venue's trade, shown where the facade photo would be until the owner sends real photos.
// Only tools of the trade or a dish, never a room, so nobody takes it for the place itself.
// Food follows the OSM cuisine; with no known cuisine there is no picture: a guessed dish would be worse than none.
// Pictures: v/_shared/niche/<name>.webp (dark still lifes from the design library, 1200x670).

export const NICHE = {
  friseur: ['hair', 'barber'],
  nails: ['nails'],
  kosmetik: ['cosmetics'],
  schneider: ['tailor'],
  cafe: ['coffee', 'cake', 'breakfast'],
};

// OSM cuisine values (lower case) → pictures. Used for restaurant and imbiss.
export const CUISINE = {
  pizza: ['pizza', 'pizza-2'],
  italian: ['pasta', 'pizza-2'],
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
  austrian: ['schnitzel'],
  regional: ['schnitzel'],
  schnitzel: ['schnitzel'],
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
    list = null;
    const tokens = typeof v.cuisine === 'string' ? v.cuisine.toLowerCase().split(/[;,]/).map((s) => s.trim()) : [];
    for (const t of tokens) if (Object.hasOwn(CUISINE, t)) { list = CUISINE[t]; break; }
  }
  return list ? `/v/_shared/niche/${pick(list, v.slug)}.webp` : null;
}
