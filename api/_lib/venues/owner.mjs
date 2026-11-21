// The owner's secret link key: only its SHA-256 hash is stored.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const hashKey = (key) => createHash('sha256').update(String(key)).digest('hex');
export const newKey = () => randomBytes(16).toString('hex');

/** True only when `key` hashes to the record's keyHash. Constant-time on the hashes. */
export function isOwner(record, key) {
  if (!record || typeof record.keyHash !== 'string' || typeof key !== 'string' || !/^[0-9a-f]{32}$/.test(key)) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(record.keyHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Start of the current calendar day in Vienna, as an ISO timestamp. */
export function viennaDayStart(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
  const sinceMidnight = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight).toISOString();
}

/** Vienna calendar day of `now` as YYYY-MM-DD. */
export const viennaDay = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
