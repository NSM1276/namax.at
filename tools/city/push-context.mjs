// Writes the built contexts (data/city/context.json, data/cities/<city>/context.json) into venues.context.
// Only slugs that exist get one; nothing else in the row changes. Run tools/venue-schema.mjs first (adds the column).
//   node tools/city/push-context.mjs [city ...]        (default: all five)
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { pgStore } from '../../api/_lib/venues/pg-store.mjs';
import { cityPaths } from './paths.mjs';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
if (!process.env.DATABASE_URL) { console.error('needs DATABASE_URL'); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const store = pgStore((text, params) => sql.query(text, params));

const cities = process.argv.slice(2).length ? process.argv.slice(2) : ['wien', 'graz', 'linz', 'salzburg', 'innsbruck'];
let total = 0;
for (const city of cities) {
  const file = `${cityPaths(city).dir}/context.json`;
  const all = Object.entries(JSON.parse(readFileSync(file, 'utf8'))).map(([slug, context]) => ({ slug, context }));
  let n = 0;
  for (let i = 0; i < all.length; i += 200) n += await store.setContexts(all.slice(i, i + 200));
  console.log(city, n, 'of', all.length, 'written');
  total += n;
}
console.log('total', total);
