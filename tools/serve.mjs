// Local preview server that mimics Vercel. Run: node tools/serve.mjs   (CITY=1 also loads data/city/venues.json)
// www: static files with cleanUrls. <slug>.localhost: the same renderPage as on Vercel, from an in-memory store
// filled with venues/*.json at start. Owner link in the preview: http://<slug>.localhost:4173/?k=local
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryStore } from '../api/_lib/venues/store.mjs';
import { hashKey } from '../api/_lib/venues/owner.mjs';
import { renderPage } from '../api/_lib/venues/page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
export const LOCAL_KEY = '0'.repeat(32);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

export async function previewStore() {
  const store = memoryStore();
  const add = (f) => store.upsertFacts(f.slug, { facts: f, keyHash: hashKey(LOCAL_KEY), status: f.status === 'removed' ? 'removed' : 'public' });
  const dir = join(root, 'venues');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('_'))) {
    await add(JSON.parse(readFileSync(join(dir, name), 'utf8')));
  }
  const city = join(root, 'data/city/venues.json');
  if (process.env.CITY && existsSync(city)) {
    for (const v of JSON.parse(readFileSync(city, 'utf8'))) if (v.ready && !(await store.getVenue(v.slug))) await add(v);
  }
  return store;
}

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (clean.startsWith('..')) return null;
  const base = join(root, clean);
  for (const candidate of [base, base + '.html', join(base, 'index.html')]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = await previewStore();
  createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const venue = /^([a-z0-9-]+)\.localhost(:\d+)?$/.exec(req.headers.host || '');
    if (venue && venue[1] !== 'www' && !url.pathname.startsWith('/v/_shared/') && !url.pathname.startsWith('/api/')) {
      const k = url.searchParams.get('k');
      const page = await renderPage({ store, slug: venue[1], key: k === 'local' ? LOCAL_KEY : k || '' });
      res.writeHead(page.status, { ...page.headers, 'cache-control': 'no-store' });
      res.end(page.body);
      return;
    }
    const file = await resolve(url.pathname);
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  }).listen(port, '127.0.0.1', () => console.log(`namax preview: http://localhost:${port}`));
}
