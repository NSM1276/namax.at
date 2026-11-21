// Chains and franchises: not our clients, left out of the dataset.

export const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Names known as chains in Vienna. Matched as whole words inside the normalized name.
const KNOWN = [
  'mcdonald s', 'mcdonalds', 'mccafe', 'burger king', 'kfc', 'subway', 'starbucks', 'nordsee', 'vapiano', 'dunkin',
  'five guys', 'pizza hut', 'domino s', 'dominos', 'dean david', 'swing kitchen', 'peter pane',
  'hard rock cafe', 'block house', 'noodle king', 'wok to walk', 'immervoll', 'le burger', 'yamm', 'tian bistro',
  'aida', 'oberlaa', 'demel', 'gerstner', 'cafe sacher', 'sacher eck', 'sacher salon', 'segafredo', 'tchibo', 'coffeeshop company', 'mcfit', 'joe and the juice',
  'strock', 'anker brot', 'felber', 'backwerk', 'der mann', 'groissbock', 'backerei schwarz', 'ottakringer brot',
  'radatz', 'wiener feinbacker', 'haas haas', 'leberkas pepi', 'turkis', 'klipp', 'interspar', 'billa',
  'ikea', 'xxxlutz', 'wild bean', 'shell cafe', 'oeamtc', 'lidl', 'penny',
  'dm friseur', 'dm friseurstudio', 'bipa', 'hairexpress', 'hair express', 'klier', 'cosmo hair', 'bundy bundy', 'intercoiffure',
  'marionnaud', 'douglas', 'magenta', 't mobile', 'yesss', 'mediamarkt',
  'hartlauer', 'telering', 'spusu', 'red zac', 'cig koftem', 'cigkoftem', 'teeamo', 'fladerei', 'dean and david',
  'mochi', 'figlmuller', 'figlmueller', 'eis greissler', 'veganista',
];
const KNOWN_RE = new RegExp(`(^| )(${KNOWN.map((k) => k.replace(/ /g, ' ?')).join('|')})( |$)`);
// Chain names that are also common words inside other venues' names: only the bare name counts.
const KNOWN_EXACT = new Set(['l osteria', 'merkur', 'hofer', 'sacher']);

// Repeated generic names are not chains.
const GENERIC = new Set(['kebab', 'kebap', 'doner', 'pizza', 'pizzeria', 'imbiss', 'cafe', 'kaffeehaus', 'restaurant', 'friseur',
  'frisor', 'barbershop', 'barber', 'barber shop', 'nails', 'nail studio', 'nagelstudio', 'kosmetik', 'schneiderei', 'anderungsschneiderei',
  'anderungs schneiderei', 'wurstelstand', 'wiener wurstelstand', 'wurstel stand', 'eissalon', 'konditorei', 'pizzeria kebap',
  'handy', 'handyshop', 'china restaurant', 'sushi', 'asia', 'heuriger', 'bistro', 'gasthaus', 'beisl', 'bar', 'snack']);

/** Why the venue counts as a chain, or null. `repeats` maps normName → number of districts the name appears in. */
export function chainReason(tags, repeats = new Map()) {
  if (tags.brand || tags['brand:wikidata'] || tags['operator:wikidata']) return 'brand tag';
  const n = normName(tags.name);
  if (KNOWN_RE.test(n) || KNOWN_EXACT.has(n)) return 'known chain';
  const d = repeats.get(n) || 0;
  if (d >= 4 && !GENERIC.has(n)) return `same name in ${d} districts`;
  return null;
}
