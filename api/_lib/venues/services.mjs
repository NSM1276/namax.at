// Real services for the Vercel functions, built once per instance from the environment:
//   DATABASE_URL (Neon), ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN. Nothing here is used by tests.
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { put } from '@vercel/blob';
import { pgStore } from './pg-store.mjs';
import { ownerPanel } from './owner-ui.mjs';

let cached;
export function services() {
  if (cached) return cached;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const sql = neon(process.env.DATABASE_URL);
  const client = new Anthropic({ maxRetries: 1, timeout: 25_000 });
  cached = {
    store: pgStore((text, params) => sql.query(text, params)),
    llm: { create: (params) => client.messages.create(params) },
    blob: { put: (path, bytes, opts) => put(path, Buffer.from(bytes), opts) },
    ownerPart: ownerPanel,
  };
  return cached;
}
