/** First phone number in the text as +43…, or null. */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.split(/[;,]/)[0].replace(/\(0\)/g, '').replace(/[\s\/\-.()]/g, '');
  if (!/^\+?\d+$/.test(p)) return null;
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+43' + p.slice(1);
  else if (!p.startsWith('+')) p = '+43' + p;
  if (p.startsWith('+430')) p = '+43' + p.slice(4);
  return /^\+[1-9]\d{6,14}$/.test(p) ? p : null;
}
