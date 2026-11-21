// Gives every venue already in the store a second opinion from Overture Maps and applies it.
//
//   node tools/places/overture-apply.mjs            dry run: reads the database, prints what would change, writes nothing
//   node tools/places/overture-apply.mjs --write    writes facts.internal.overture, hides hours where the sources disagree,
//                                                   hides pages Overture calls closed (see statusAfter)
//
// Only facts.internal.overture, facts.uncertain and the status change; names, hours, phones and hand-researched facts stay.
// Needs DATABASE_URL in .env.local and data/places/overture-wien.json (python tools/places/overture-export.py …).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { overtureIndex, secondOpinion, withOverture, statusAfter } from '../city/overture.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** records as from store.listForAdmin; coords: slug → {lat, lon} for facts without them. → [{ slug, facts, status, opinion, changed }] */
export function planOverture(records, { index, release, siteChecks = {}, coords = new Map() }) {
  return records.map((r) => {
    const f = r.facts;
    const at = (f.internal?.lat != null && f.internal?.lon != null) ? f.internal : coords.get(r.slug) || {};
    const opinion = secondOpinion({ kind: f.kind, name: f.name, phone: f.phone, street: f.address?.street, lat: at.lat, lon: at.lon },
      index, release, siteChecks);
    let facts = withOverture(f, opinion);
    const next = statusAfter({ status: r.status, confirmed: Boolean(r.confirmedAt), verdict: opinion.verdict, hidPage: f.internal?.overture?.hidPage });
    facts.internal.overture = { ...facts.internal.overture };
    if (next.hidPage) facts.internal.overture.hidPage = true; else delete facts.internal.overture.hidPage;
    const changed = !isDeepStrictEqual(facts, f) || next.status !== r.status;
    return { slug: r.slug, name: f.name, before: r.status, status: next.status, opinion, facts, changed };
  });
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
  const write = process.argv.includes('--write');
  loadEnv();
  if (!process.env.DATABASE_URL) { console.error('needs DATABASE_URL (in .env.local)'); process.exit(1); }
  const { neon } = await import('@neondatabase/serverless');
  const { pgStore } = await import('../../api/_lib/venues/pg-store.mjs');
  const sql = neon(process.env.DATABASE_URL);
  const store = pgStore((t, p) => sql.query(t, p));

  const ov = read('data/places/overture-wien.json');
  const siteChecks = existsSync(join(root, 'data/city/site-checks.json')) ? read('data/city/site-checks.json') : {};
  const coords = new Map(existsSync(join(root, 'data/city/venues.json'))
    ? read('data/city/venues.json').map((v) => [v.slug, { lat: v.internal.lat, lon: v.internal.lon }]) : []);
  const records = await store.listForAdmin();
  const plan = planOverture(records, { index: overtureIndex(ov.places), release: ov.release, siteChecks, coords });

  const count = (f) => plan.filter(f).length;
  const by = {};
  for (const p of plan) by[p.opinion.verdict] = (by[p.opinion.verdict] || 0) + 1;
  const hide = plan.filter((p) => p.before === 'public' && p.status === 'hidden');
  const show = plan.filter((p) => p.before === 'hidden' && p.status === 'public');
  const hoursOff = count((p) => p.facts.internal.overture.hidHours);
  const phones = count((p) => !p.facts.phone && p.opinion.match?.phone);
  const ownSite = count((p) => p.opinion.siteCheck?.state === 'works');
  const lines = [
    `${write ? 'WRITING' : 'DRY RUN (nothing written)'} · Overture ${ov.release} · ${plan.length} venues`,
    `  both ${by.both || 0} · osm only ${by.osm || 0} · other business at the address ${by.other || 0} · closed ${by.closed || 0}`,
    `  pages to hide ${hide.length} · to show again ${show.length} · hours hidden ${hoursOff} · Overture phone where we have none ${phones} · own working site per Overture ${ownSite}`,
    `  facts changed ${count((p) => p.changed)}`,
  ];
  console.log(lines.join('\n'));
  const report = [`# Overture check ${new Date().toISOString().slice(0, 10)}`, '', ...lines, '',
    '## Closed according to Overture', ...plan.filter((p) => p.opinion.verdict === 'closed').map((p) => `- ${p.name} (${p.slug}) → ${p.opinion.match.name}, ${p.opinion.match.status}`), '',
    '## Another business at the address', ...plan.filter((p) => p.opinion.verdict === 'other').map((p) => `- ${p.name} (${p.slug}) → ${p.opinion.other.name}`), ''];
  writeFileSync(join(root, 'data/places/overture-apply-report.md'), report.join('\n'));
  console.log('report: data/places/overture-apply-report.md');

  if (write) {
    let n = 0;
    for (const p of plan.filter((x) => x.changed)) {
      const cur = await store.getVenue(p.slug);
      if (!cur || cur.status === 'removed') continue;
      await store.upsertFacts(p.slug, { facts: p.facts, keyHash: cur.keyHash, status: cur.status });
      if (p.status !== cur.status) await store.setStatus(p.slug, p.status);
      if (++n % 100 === 0) console.log(n, 'written');
    }
    console.log('written', n);
  }
}
