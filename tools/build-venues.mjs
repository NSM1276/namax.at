// Builds venue pages: venues/<slug>.json  ->  v/<slug>/index.html
// Run: node tools/build-venues.mjs   (exit 1 and nothing written if any venue is invalid)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateVenue } from '../api/_lib/venues/schema.mjs';
import { renderVenue } from '../api/_lib/venues/template.mjs';

const KEEP = new Set(['_shared']);

export function buildVenues({ srcDir, outDir, allowEmpty = false }) {
  const result = { built: [], removed: [], errors: [] };
  const files = existsSync(srcDir)
    ? readdirSync(srcDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()
    : [];

  // A mistyped or empty source folder must never wipe the pages that already exist.
  if (!files.length && !allowEmpty) {
    result.errors.push(`${srcDir}: no venue files found (pass --allow-empty to remove every page on purpose)`);
    return result;
  }

  const pages = new Map(); // slug -> html
  const live = new Set();
  for (const file of files) {
    const fileSlug = basename(file, '.json');
    let venue;
    try {
      venue = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
    } catch (err) {
      result.errors.push(`${file}: not valid JSON (${err.message})`);
      continue;
    }
    const problems = validateVenue(venue, fileSlug);
    if (problems.length) { result.errors.push(`${file}: ${problems.join('; ')}`); continue; }
    if (venue.status === 'removed') continue;
    try {
      pages.set(venue.slug, renderVenue(venue));
      live.add(venue.slug);
    } catch (err) {
      result.errors.push(`${file}: ${err.message}`);
    }
  }
  if (result.errors.length) return result;

  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    const abs = join(outDir, name);
    if (KEEP.has(name) || live.has(name) || !statSync(abs).isDirectory()) continue;
    rmSync(abs, { recursive: true, force: true });
    result.removed.push(name);
  }
  for (const [slug, html] of pages) {
    mkdirSync(join(outDir, slug), { recursive: true });
    writeFileSync(join(outDir, slug, 'index.html'), html);
    result.built.push(slug);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--')) || 'venues';
  // Only the real "venues" folder writes to v/ (deployed). Any other source is a
  // preview and goes to v-preview/ (never deployed; tools/serve.mjs falls back to it).
  const out = src === 'venues' ? 'v' : 'v-preview';
  const r = buildVenues({ srcDir: join(root, src), outDir: join(root, out), allowEmpty: args.includes('--allow-empty') });
  for (const e of r.errors) console.error(`error  ${e}`);
  for (const s of r.removed) console.log(`removed  ${s}`);
  for (const s of r.built) console.log(`built    ${s}`);
  if (r.errors.length) { console.error('Nothing was written.'); process.exit(1); }
  console.log(`${r.built.length} built, ${r.removed.length} removed -> ${out}/`);
}
