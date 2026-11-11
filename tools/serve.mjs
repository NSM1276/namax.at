// Local preview server that mimics Vercel's cleanUrls. Run: node tools/serve.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (clean.startsWith('..')) return null;
  const base = join(root, clean);
  for (const candidate of [base, base + '.html', join(base, 'index.html')]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolve(pathname);
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(await readFile(file));
}).listen(port, '127.0.0.1', () => console.log(`namax preview: http://localhost:${port}`));
