import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVenues } from '../build-venues.mjs';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
function setup(venues = [fixture('full'), fixture('minimal')]) {
  const srcDir = mkdtempSync(join(tmpdir(), 'venues-src-'));
  const outDir = mkdtempSync(join(tmpdir(), 'venues-out-'));
  for (const v of venues) writeFileSync(join(srcDir, `${v.slug}.json`), JSON.stringify(v));
  return { srcDir, outDir };
}
const page = (outDir, slug) => join(outDir, slug, 'index.html');

test('builds hidden and public venues, lists them', () => {
  const d = setup();
  const r = buildVenues(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.built, ['friseur-meidling', 'minimal']);
  assert.ok(readFileSync(page(d.outDir, 'friseur-meidling'), 'utf8').includes('Friseur Meidling'));
  assert.ok(existsSync(page(d.outDir, 'minimal')));
});
test('removed status deletes an existing output dir', () => {
  const d = setup();
  buildVenues(d);
  writeFileSync(join(d.srcDir, 'minimal.json'), JSON.stringify({ ...fixture('minimal'), status: 'removed' }));
  const r = buildVenues(d);
  assert.deepEqual(r.removed, ['minimal']);
  assert.ok(!existsSync(join(d.outDir, 'minimal')));
  assert.deepEqual(r.built, ['friseur-meidling']);
});
test('deleting the facts file deletes the output dir', () => {
  const d = setup();
  buildVenues(d);
  rmSync(join(d.srcDir, 'minimal.json'));
  const r = buildVenues(d);
  assert.deepEqual(r.removed, ['minimal']);
  assert.ok(!existsSync(join(d.outDir, 'minimal')));
});
test('_shared is never deleted', () => {
  const d = setup();
  mkdirSync(join(d.outDir, '_shared'));
  writeFileSync(join(d.outDir, '_shared', 'x'), 'x');
  buildVenues(d);
  assert.ok(existsSync(join(d.outDir, '_shared', 'x')));
});
test('one invalid venue blocks the whole build and writes nothing', () => {
  const d = setup([fixture('full'), { ...fixture('minimal'), kind: 'bank' }]);
  const r = buildVenues(d);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /minimal\.json/);
  assert.deepEqual(readdirSync(d.outDir), []);
  assert.deepEqual(r.built, []);
});
test('an invalid venue does not delete pages that already exist', () => {
  const d = setup();
  buildVenues(d);
  writeFileSync(join(d.srcDir, 'minimal.json'), '{ broken');
  const r = buildVenues(d);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /minimal\.json/);
  assert.ok(existsSync(page(d.outDir, 'minimal')));
});
test('files starting with _ are ignored', () => {
  const d = setup([fixture('minimal')]);
  writeFileSync(join(d.srcDir, '_beispiel.json'), JSON.stringify({ ...fixture('full'), slug: '_beispiel' }));
  const r = buildVenues(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.built, ['minimal']);
});
