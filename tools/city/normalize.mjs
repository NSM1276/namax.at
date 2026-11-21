// Turns raw OpenStreetMap tags into the plain facts a venue page needs.

/** Our venue kind for an OSM element, or null when we do not serve it. */
export function kindOf(t) {
  if (t.amenity === 'fast_food') return 'imbiss';
  if (t.amenity === 'restaurant') return 'restaurant';
  if (t.amenity === 'cafe') return 'cafe';
  if (t.shop === 'hairdresser') return t.hairdresser === 'dog' ? null : 'friseur';
  if (t.shop === 'beauty') {
    if (/nail/i.test(t.beauty || '') || /nail|nägel|nagel/i.test(t.name || '')) return 'nails';
    return 'kosmetik';
  }
  if (t.shop === 'mobile_phone' || t.craft === 'electronics_repair') return 'handy';
  if (t.shop === 'tailor' || t.craft === 'tailor' || t.craft === 'dressmaker') return 'schneider';
  return null;
}

/** First phone number in the tag as +43…, or null. */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.split(/[;,]/)[0].replace(/\(0\)/g, '').replace(/[\s\/\-.()]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+43' + p.slice(1);
  else if (!p.startsWith('+')) p = '+43' + p;
  if (p.startsWith('+430')) p = '+43' + p.slice(4);
  return /^\+[1-9]\d{6,14}$/.test(p) ? p : null;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v <= 1440 ? v : null;
};

function daySet(sel) {
  const days = new Set();
  for (const part of sel.split(',')) {
    if (part === 'PH' || part === 'SH') continue;
    const r = /^(Su|Mo|Tu|We|Th|Fr|Sa)(?:-(Su|Mo|Tu|We|Th|Fr|Sa))?$/.exec(part);
    if (!r) return null;
    const a = DAYS.indexOf(r[1]);
    const b = r[2] ? DAYS.indexOf(r[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { days.add(i); if (i === b) break; }
  }
  return days;
}

/**
 * OSM opening_hours → 7 entries (Sunday first) of null or [open, close] in minutes.
 * Returns null for anything one interval per day cannot hold faithfully.
 */
export function parseOpeningHours(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();
  if (s === '24/7') return Array(7).fill([0, 1440]);
  const hours = Array(7).fill(null);
  let any = false;
  for (const rule of s.split(';').map((x) => x.trim()).filter(Boolean)) {
    let sel = null, time = rule;
    const m = /^([A-Za-z,\-]+)\s+(.+)$/.exec(rule);
    if (m) { sel = m[1]; time = m[2].trim(); }
    let days;
    if (sel) {
      days = daySet(sel);
      if (!days) return null;
      if (days.size === 0) continue; // a PH/SH-only rule
    } else if (/^(off|closed)$/.test(rule)) {
      return null;
    } else {
      days = new Set([0, 1, 2, 3, 4, 5, 6]);
    }
    if (/^(off|closed)$/.test(time)) { for (const d of days) hours[d] = null; continue; }
    const t = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(time);
    if (!t) return null;
    const open = toMin(t[1]);
    let close = toMin(t[2]);
    if (open === null || close === null || open >= 1440 || open === close) return null;
    if (close === 0) close = 1440;
    for (const d of days) hours[d] = [open, close];
    any = true;
  }
  return any && hours.some(Boolean) ? hours : null;
}

const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|linktr\.ee|youtube\.com|twitter\.com|x\.com|wa\.me|t\.me)$/;
const PLATFORM = /(^|\.)(treatwell\.\w+|booksy\.com|planity\.com|fresha\.com|lieferando\.\w+|foodora\.\w+|mjam\.net|wolt\.com|ubereats\.com|tripadvisor\.\w+|google\.\w+|goo\.gl|herold\.at|falstaff\.\w+|thefork\.\w+|quandoo\.\w+|opentable\.\w+|yelp\.\w+|gleichbeidir\.at|order\.store|shore\.com|salonkee\.\w+|studiobookr\.com|termin\.\w+|wixsite\.com)$/;

/** 'own' | 'social' | 'platform' for a website tag, or null if it is no URL. */
export function siteKind(raw) {
  if (typeof raw !== 'string') return null;
  let host;
  try { host = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw).hostname.toLowerCase(); } catch { return null; }
  if (!host.includes('.')) return null;
  if (SOCIAL.test(host)) return 'social';
  if (PLATFORM.test(host)) return 'platform';
  return 'own';
}
