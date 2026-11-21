// Loads venue facts into the store and writes the owners' secret links.
//
//   node tools/venue-sync.mjs --city --district 12 --kind friseur [--limit 15] [--hidden] [--write]
//   New venues are public (in search) from the start, as agreed; --hidden stores them with noindex.
//   node tools/venue-sync.mjs --files                     (venues/*.json)
//
// Without --write nothing leaves this computer: it runs against an empty in-memory store and prints what it would do.
// With --write it needs DATABASE_URL (from .env.local) and writes to that database.
// Keys live only in venues/.keys.tsv and the links file venues/.links-<date>.md (both git-ignored); the store keeps hashes.
// Removed and do-not-contact venues are never touched and never get a link.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashKey, newKey, viennaDay } from '../api/_lib/venues/owner.mjs';
import { validateVenue } from '../api/_lib/venues/schema.mjs';
import { memoryStore } from '../api/_lib/venues/store.mjs';
import { sealOwnerKey } from '../api/_lib/venues/admin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS_FILE = join(root, 'venues/.keys.tsv');

/** A venue with its own working website promotes that site; a namax page would compete with it in Google. */
export const hasWorkingSite = (v) => v.internal?.site === 'own' && v.internal?.siteCheck?.state === 'works';

export function pickVenues(all, { district, kind, limit } = {}) {
  let out = all.filter((v) => v.ready !== false && !hasWorkingSite(v));
  if (district != null) out = out.filter((v) => Number(v.internal?.district) === Number(district));
  if (kind) out = out.filter((v) => v.kind === kind);
  return limit ? out.slice(0, Number(limit)) : out;
}

export const parseKeys = (text) => new Map(String(text).split(/\r?\n/)
  .map((l) => l.trim().split('\t')).filter(([s, k]) => s && !s.startsWith('#') && /^[0-9a-f]{32}$/.test(k || '')));
export const formatKeys = (keys) => [...keys].map(([s, k]) => `${s}\t${k}`).join('\n') + '\n';

/** → { added, updated, skipped, invalid, noKey, links: [{ slug, name, url }], keys } */
export async function syncVenues({ store, venues, keys, publish = true, adminKey = null }) {
  keys = new Map(keys);
  const r = { added: [], updated: [], skipped: [], invalid: [], noKey: [], links: [], keys };
  for (const raw of venues) {
    const { ready, ...facts } = raw;
    const problems = validateVenue(facts, facts.slug);
    if (problems.length) { r.invalid.push(`${facts.slug}: ${problems[0]}`); continue; }
    const slug = facts.slug;
    const existing = await store.getVenue(slug);
    if (existing && (existing.status === 'removed' || existing.doNotContact)) { r.skipped.push(slug); continue; }
    if (!existing) {
      const key = newKey();
      await store.upsertFacts(slug, { facts, keyHash: hashKey(key), status: publish ? 'public' : 'hidden' });
      keys.set(slug, key);
      r.added.push(slug);
    } else {
      await store.upsertFacts(slug, { facts, keyHash: existing.keyHash, status: existing.status });
      r.updated.push(slug);
      const key = keys.get(slug);
      if (!key || hashKey(key) !== existing.keyHash) { r.noKey.push(slug); continue; }
    }
    if (adminKey) await store.setOwnerKeyEnc(slug, sealOwnerKey(adminKey, slug, keys.get(slug))); // for the private list
    r.links.push({ slug, name: facts.name, url: `https://${slug}.namax.at/?k=${keys.get(slug)}` });
  }
  return r;
}

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { a._.push(argv[i]); continue; }
    const k = argv[i].slice(2);
    a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return a;
}

function loadEnv() {
  const f = join(root, '.env.local');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  const all = [];
  if (a.files) {
    for (const n of readdirSync(join(root, 'venues')).filter((n) => n.endsWith('.json') && !n.startsWith('_'))) {
      all.push(JSON.parse(readFileSync(join(root, 'venues', n), 'utf8')));
    }
  }
  if (a.city) all.push(...JSON.parse(readFileSync(join(root, 'data/city/venues.json'), 'utf8')));
  if (!all.length) { console.error('Nothing to sync: pass --city and/or --files'); process.exit(1); }
  const venues = pickVenues(all, { district: a.district, kind: a.kind, limit: a.limit });
  let store = memoryStore();
  if (a.write) {
    loadEnv();
    if (!process.env.DATABASE_URL) { console.error('--write needs DATABASE_URL (in .env.local)'); process.exit(1); }
    const { neon } = await import('@neondatabase/serverless');
    const { pgStore } = await import('../api/_lib/venues/pg-store.mjs');
    const sql = neon(process.env.DATABASE_URL);
    store = pgStore((t, p) => sql.query(t, p));
  }
  const keys = existsSync(KEYS_FILE) ? parseKeys(readFileSync(KEYS_FILE, 'utf8')) : new Map();
  const adminKey = /^[0-9a-f]{32}$/.test(process.env.NAMAX_ADMIN_KEY || '') ? process.env.NAMAX_ADMIN_KEY : null;
  if (a.write && !adminKey) console.warn('NAMAX_ADMIN_KEY missing in .env.local: owner links will not appear in the private list');
  const r = await syncVenues({ store, venues, keys, publish: !a.hidden, adminKey });
  console.log(`${a.write ? 'WROTE' : 'DRY RUN (nothing written)'}: ${venues.length} picked · added ${r.added.length} · updated ${r.updated.length}`
    + ` · skipped (removed/do-not-contact) ${r.skipped.length} · invalid ${r.invalid.length} · no key ${r.noKey.length}`);
  for (const x of r.invalid.slice(0, 20)) console.log('  invalid ' + x);
  if (a.write) {
    writeFileSync(KEYS_FILE, formatKeys(r.keys));
    const file = join(root, `venues/.links-${viennaDay()}.md`);
    writeFileSync(file, `# Owner links ${viennaDay()} — secret, do not share or commit\n\n`
      + r.links.map((l) => `- ${l.name}: ${l.url}`).join('\n') + '\n');
    console.log(`keys: venues/.keys.tsv · links: ${file.slice(root.length + 1)}`);
  }
}
