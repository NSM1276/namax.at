// What happened on the venue pages: removals first, then questions for Nasim, then changes. Read-only.
//   node tools/venue-inbox.mjs [--hours 24]      (needs DATABASE_URL in .env.local)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORDER = [
  ['removal', 'Срочно (URGENT): владелец удалил страницу — больше не писать'],
  ['handoff', 'Вопросы к тебе'],
  ['changed', 'Изменения'],
  ['confirmed', 'Подтвердили данные'],
];

export function inboxReport(events) {
  if (!events.length) return 'За этот период ничего не произошло (nothing new).';
  const parts = [];
  for (const [type, title] of ORDER) {
    const list = events.filter((e) => e.type === type);
    if (!list.length) continue;
    parts.push(`## ${title} (${list.length})\n` + list.map((e) =>
      `- ${String(e.at).slice(0, 16).replace('T', ' ')} · https://${e.slug}.namax.at/${e.text ? ' · ' + e.text : ''}`).join('\n'));
  }
  const other = events.filter((e) => !ORDER.some(([t]) => t === e.type));
  if (other.length) parts.push('## Прочее\n' + other.map((e) => `- ${e.slug} · ${e.type} · ${e.text}`).join('\n'));
  return parts.join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const env = join(root, '.env.local');
  if (existsSync(env)) for (const line of readFileSync(env, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  if (!process.env.DATABASE_URL) { console.error('needs DATABASE_URL (in .env.local)'); process.exit(1); }
  const i = process.argv.indexOf('--hours');
  const hours = i > 0 ? Number(process.argv[i + 1]) : 24;
  const { neon } = await import('@neondatabase/serverless');
  const { pgStore } = await import('../api/_lib/venues/pg-store.mjs');
  const sql = neon(process.env.DATABASE_URL);
  const events = await pgStore((t, p) => sql.query(t, p)).listEvents(new Date(Date.now() - hours * 3600_000).toISOString());
  console.log(inboxReport(events));
}
