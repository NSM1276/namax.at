// Writes every slug in the database (all cities, removed pages too) to data/raw/taken-slugs.txt, one per line.
// Read only: a single SELECT. build-dataset.mjs reads the file so a new city never takes a slug that is already in use.
// Usage: node tools/city/taken-slugs.mjs   (needs DATABASE_URL in .env.local)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
if (!process.env.DATABASE_URL) { console.error('needs DATABASE_URL (in .env.local)'); process.exit(1); }
const { neon } = await import('@neondatabase/serverless');
const rows = await neon(process.env.DATABASE_URL).query('select slug from venues order by slug');
mkdirSync('data/raw', { recursive: true });
writeFileSync('data/raw/taken-slugs.txt', rows.map((r) => r.slug).join('\n') + '\n');
console.log('data/raw/taken-slugs.txt', rows.length, 'slugs');
