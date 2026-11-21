// Creates the venue tables in the database from DATABASE_URL (.env.local). Safe to repeat: "if not exists".
//   node tools/venue-schema.mjs
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
if (!process.env.DATABASE_URL) { console.error('needs DATABASE_URL'); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const text = readFileSync(new URL('../api/_lib/venues/schema.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
for (const stmt of text.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
const rows = await sql.query("select table_name from information_schema.tables where table_schema = 'public' and table_name like 'venue%' order by 1");
console.log('tables:', rows.map((r) => r.table_name).join(', '));
