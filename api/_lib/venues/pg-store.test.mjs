// The store contract on a real Postgres engine (PGlite, in process) with schema.sql.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgStore } from './pg-store.mjs';
import { storeContract } from './store.test.mjs';

const db = new PGlite();
await db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const query = (t, p) => db.query(t, p).then((r) => r.rows);

storeContract(async () => {
  await db.exec('truncate venue_requests, venue_model_calls, venue_hits, venue_events, venue_photos, venue_messages, venues restart identity cascade');
  return pgStore(query);
}, 'pg-');
