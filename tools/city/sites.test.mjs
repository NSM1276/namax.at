import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySite } from './check-sites.mjs';

const page = (title, body = 'x'.repeat(5000)) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

test('classifySite: a normal page is a working site', () => {
  assert.deepEqual(classifySite({ status: 200, url: 'https://friseur.at/', html: page('Friseur Ali — Wien') }), { ok: true, state: 'works' });
});

test('classifySite: bot walls still mean the site exists', () => {
  assert.equal(classifySite({ status: 403, url: 'https://x.at/', html: '' }).state, 'works');
  assert.equal(classifySite({ status: 429, url: 'https://x.at/', html: '' }).ok, true);
});

test('classifySite: dead, parked and placeholder sites do not count', () => {
  assert.deepEqual(classifySite({ error: 'ENOTFOUND' }), { ok: false, state: 'dead', detail: 'ENOTFOUND' });
  assert.equal(classifySite({ status: 404, url: 'https://x.at/', html: '' }).state, 'dead');
  assert.equal(classifySite({ status: 503, url: 'https://x.at/', html: '' }).state, 'dead');
  assert.equal(classifySite({ status: 200, url: 'https://sedo.com/search/details/?domain=x.at', html: page('x.at') }).state, 'parked');
  assert.equal(classifySite({ status: 200, url: 'https://x.at/', html: page('Diese Domain steht zum Verkauf') }).state, 'parked');
  assert.equal(classifySite({ status: 200, url: 'https://x.at/', html: page('Coming soon') }).state, 'placeholder');
  assert.equal(classifySite({ status: 200, url: 'https://x.at/', html: page('Website in Bearbeitung') }).state, 'placeholder');
  assert.equal(classifySite({ status: 200, url: 'https://x.at/', html: '<html><body></body></html>' }).state, 'placeholder');
});

test('classifySite: a redirect to social media is no own site', () => {
  assert.equal(classifySite({ status: 200, url: 'https://www.facebook.com/abc', html: page('Facebook') }).state, 'social');
});
