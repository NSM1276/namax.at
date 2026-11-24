// How a venue's name sits on the enamel sign, the way a sign painter would letter it (Nasim, 2026-11-24):
// the proper name big, a trade word ("Gasthaus", "Cafe") small above it, extra words ("Konditorei / Kaffeehaus") small below.
// The name itself is never changed: the page title, the schema block and Google keep the full name; only the sign splits it.

// Words that say what the place is, not what it is called. Taken off only at the very start or the very end of the name.
const GENERIC = new Set(['cafe', 'café', 'caffe', 'caffè', 'kaffee', 'kaffeehaus', 'konditorei', 'cafe-konditorei', 'café-konditorei', 'eissalon',
  'restaurant', 'ristorante', 'gasthaus', 'gasthof', 'wirtshaus', 'beisl', 'beisel', 'trattoria', 'pizzeria', 'osteria', 'bistro', 'brasserie',
  'heuriger', 'heurigen', 'buschenschank', 'imbiss', 'imbiß', 'snackbar',
  'friseur', 'frisör', 'friseursalon', 'coiffeur', 'barbershop', 'barber', 'kosmetik', 'kosmetikstudio', 'kosmetiksalon', 'nagelstudio',
  'änderungsschneiderei', 'schneiderei', 'handyshop', 'chinarestaurant']);
// After these a trailing trade word belongs to the name: "Atelier 7 The Café", "Zum Café".
const BINDS = /^(the|der|die|das|la|le|il|lo|el|zum|zur|am|im|beim|vom|da|di|de|du|del|bei|und|&)$/i;
const LEGAL = /\s*,?\s*\b(?:gmbh|ges\.?\s?m\.?\s?b\.?\s?h\.?|e\.\s?u\.?|og|kg)(?=\s|$|\))\.?/gi;
const CITY = /\s+(wien|vienna|graz|linz|salzburg|innsbruck)$/i;
const SEP = /\s+[\/|–—-]\s+/;
const isGeneric = (w) => GENERIC.has(w.toLowerCase().replace(/[.,]$/, ''));
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/^[\s,;:·-]+|[\s,;:·-]+$/g, '').trim();
// "Sabine Pawlik / Christian Pulker": two people, not "name and description" — such a name stays in one piece.
const personish = (s) => /^\p{Lu}[\p{Ll}'-]+(?:\s\p{Lu}[\p{Ll}'-]+){1,2}$/u.test(s.trim()) && !s.split(/\s+/).some(isGeneric);

/** → { pre, main, sub }: pre = trade word for the small line above ('' = use the kind label), main = big, sub = small line below. */
export function signName(name) {
  const full = String(name || '').trim();
  // a company name in brackets is for the trade register, not the sign: "Sunny (Golden Palace … Betriebs GmbH)"
  let main = full.replace(/\s*\([^()]*\b(?:gmbh|e\.\s?u\.|og|kg)\b[^()]*\)/gi, '').replace(LEGAL, '').trim() || full;
  const subs = [];
  let pre = '';

  // (…) at the end → small line
  const par = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(main);
  if (par && tidy(par[1])) { main = tidy(par[1]); if (tidy(par[2])) subs.push(tidy(par[2])); }

  // Heurigenschank "Zum Berger": the quoted part is the name, the words in front say what it is
  const q = /^([^"“”„«»]*?)\s*["“„«]([^"“”„«»]+)["”“»]\s*$/.exec(main);
  if (q && tidy(q[1]) && tidy(q[2])) {
    const before = tidy(q[1]);
    if (before.split(/\s+/).length <= 3) { pre = before; main = tidy(q[2]); } else { main = before; subs.unshift(tidy(q[2])); }
  }

  // "Stella Eissalon / Konditorei / Kaffeehaus", "GARY - Styling & Trends": first part big, the rest below
  if (SEP.test(main)) {
    const parts = main.split(SEP).map(tidy).filter(Boolean);
    if (parts.length > 1 && !(parts.length === 2 && personish(parts[0]) && personish(parts[1]))) { main = parts[0]; subs.unshift(...parts.slice(1)); }
  }

  // "Das Hodzic, Cafe" → the trade words after a comma go below
  const comma = /^(.*?),\s*(.+)$/.exec(main);
  if (comma && comma[2].split(/\s+/).every(isGeneric)) { main = tidy(comma[1]); subs.unshift(tidy(comma[2])); }

  // the city is written at the bottom of the sign anyway: "Il Centro Graz" → "Il Centro", "Graz" below
  const city = CITY.exec(main);
  if (city && main.length - city[0].length >= 3) { main = main.slice(0, city.index); subs.push(city[1]); }

  // a trade word at the start or the end goes to the small line above: "Gasthaus Bauer", "Romuliana Grill"
  if (!pre) {
    const w = main.split(/\s+/);
    let a = 0;
    while (a < w.length - 1 && isGeneric(w[a])) a++;
    let b = w.length;
    // "Vegan Market & Asian Bistro": after an "&" the trade word is part of the name
    if (a === 0 && !/\s(&|und|and)\s/i.test(main)) while (b > 1 && isGeneric(w[b - 1]) && !BINDS.test(w[b - 2])) b--;
    const rest = w.slice(a, b).join(' ');
    if (rest !== main && rest.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && !w.slice(a, b).every(isGeneric)) {
      pre = (a ? w.slice(0, a) : w.slice(b)).join(' ');
      main = rest;
    }
  }
  return { pre: tidy(pre), main: tidy(main) || full, sub: subs.map(tidy).filter(Boolean).join(' · ') };
}

// Size of the big name. A long single word must fit one line; a long name may take two lines (three past 30 letters);
// a very short name is held back, so "BERT" is not a wall of letters. Barlow Condensed bold capitals are about 0.52em wide.
export function signSize(main) {
  const s = String(main);
  const longest = Math.max(...s.split(/\s+/).map((x) => x.length));
  const n = s.length;
  const perLine = n <= 12 ? n : n <= 30 ? Math.ceil(n / 2) + 2 : Math.ceil(n / 3) + 3;
  const need = Math.max(longest, perLine, 6);
  const cqi = Math.floor((100 / (need * 0.52)) * 10) / 10;
  const vw = Math.floor((150 / need) * 10) / 10;
  return { cqi, vw };
}
