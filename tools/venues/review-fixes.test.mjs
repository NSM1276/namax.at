import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVenues } from '../build-venues.mjs';
import { validateVenue } from './schema.mjs';
import { renderVenue } from './template.mjs';
import { venuePath } from '../../middleware.js';
const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));

test('C1: venue hosts map to /v/<slug>, everything else is left alone', () => {
  assert.equal(venuePath('friseur-meidling.namax.at', '/'), '/v/friseur-meidling');
  assert.equal(venuePath('Friseur-Meidling.namax.at:443', '/'), '/v/friseur-meidling');
  assert.equal(venuePath('friseur-meidling.namax.at', '/p1.jpg'), '/v/friseur-meidling/p1.jpg');
  assert.equal(venuePath('friseur-meidling.namax.at', '/impressum'), '/v/friseur-meidling/impressum');
  assert.equal(venuePath('friseur-meidling.namax.at', '/v/_shared/fonts/anton-latin.woff2'), null);
  for (const host of ['www.namax.at', 'namax.at', 'namax-at.vercel.app', 'a.b.namax.at', 'x.namax.at.evil.com', 'wwwxnamax.at', '', null])
    assert.equal(venuePath(host, '/'), null, String(host));
});
test('I1: a missing or empty source folder is an error and deletes nothing', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'venues-out-'));
  mkdirSync(join(outDir, 'keep-me'));
  const missing = buildVenues({ srcDir: join(outDir, 'nope'), outDir });
  assert.equal(missing.errors.length, 1);
  const empty = buildVenues({ srcDir: mkdtempSync(join(tmpdir(), 'venues-src-')), outDir });
  assert.equal(empty.errors.length, 1);
  assert.ok(existsSync(join(outDir, 'keep-me')));
  const allowed = buildVenues({ srcDir: mkdtempSync(join(tmpdir(), 'venues-src-')), outDir, allowEmpty: true });
  assert.deepEqual(allowed.errors, []);
  assert.deepEqual(allowed.removed, ['keep-me']);
});
test('I4: inherited object keys are not palettes or letterings', () => {
  for (const theme of [{ palette: 'constructor' }, { palette: '__proto__' }, { lettering: 'toString' }, { palette: 'nope' }]) {
    const v = { ...fixture('minimal'), theme };
    assert.ok(validateVenue(v, 'minimal').length > 0, JSON.stringify(theme));
    assert.throws(() => renderVenue(v), JSON.stringify(theme));
  }
  assert.deepEqual(validateVenue({ ...fixture('minimal'), theme: { palette: 'black-gold' } }, 'minimal'), []);
});

import { openState } from './hours.mjs';
test('M1: a venue open one day a week does not claim it opens today after closing', () => {
  const monday = [null, [540, 1140], null, null, null, null, null];
  assert.deepEqual(openState(monday, 1, 1200).opensAt, { day: 1, minute: 540, nextWeek: true });
  assert.deepEqual(openState(monday, 1, 500).opensAt, { day: 1, minute: 540 });
  assert.ok(renderVenue({ ...fixture('full') }).includes('nextWeek'));
});
test('M2–M4: opening at 1440, huge prices and odd photo paths are rejected', () => {
  const m = fixture('minimal');
  assert.ok(validateVenue({ ...m, hours: Array(7).fill([1440, 0]) }, 'minimal').length);
  assert.ok(validateVenue({ ...m, list: { asOf: '2026-11', groups: [{ items: [{ name: 'x', price: 1e21 }] }] } }, 'minimal').length);
  for (const p of ['https://evil.example/a.jpg', '../a.jpg', 'javascript:alert(1)', 'A.JPG', 'a.gif'])
    assert.ok(validateVenue({ ...m, photos: [p] }, 'minimal').length, p);
  assert.deepEqual(validateVenue({ ...m, photos: ['foto-1.jpg', 'laden.webp'] }, 'minimal'), []);
  assert.ok(renderVenue({ ...m, photos: ['foto-1.jpg'] }).includes('src="/foto-1.jpg"'));
});
test('M7: language buttons are labelled, the title has an English form, the owner line sets its direction', () => {
  const html = renderVenue(fixture('full'));
  assert.ok(html.includes('aria-label="Deutsch"') && html.includes('aria-label="English"'));
  assert.ok(html.includes('data-title-en="Friseur Meidling — '));
  assert.ok(html.includes('<p dir="auto">'));
  assert.ok(renderVenue(fixture('minimal')).includes('data-title-en="Minimal — 1120 Wien"'));
});
