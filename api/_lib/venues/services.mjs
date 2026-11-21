// Real services for the Vercel functions, built once per instance from the environment:
//   DATABASE_URL (Neon), ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN. Nothing here is used by tests.
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { put, del } from '@vercel/blob';
import { pgStore } from './pg-store.mjs';
import { ownerPanel } from './owner-ui.mjs';

let cached;
export function services() {
  if (cached) return cached;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const sql = neon(process.env.DATABASE_URL);
  // without a key the chat still works: free text and price photos go to Nasim as a handoff
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 25_000 }) : null;
  cached = {
    store: pgStore((text, params) => sql.query(text, params)),
    llm: client ? { create: (params) => client.messages.create(params) } : null,
    blob: { put: (path, bytes, opts) => put(path, Buffer.from(bytes), opts), del: (urls) => del(urls) },
    ownerPart: ownerPanel,
  };
  return cached;
}
