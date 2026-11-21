import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameName, overtureIndex, overtureVerdict, withOverture, statusAfter } from './overture.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/overture-sample.json', import.meta.url), 'utf8'));
const index = overtureIndex(fixture.places);
const verdictOf = (slug) => overtureVerdict(fixture.venues.find((v) => v.slug === slug), index);

test('sameName: spelling, word order, extra words and scripts', () => {
  assert.ok(sameName('Al-Doumani', 'Aldoumani Restaurant'));
  assert.ok(sameName('No 27 Malatang', 'Malatang No 27'));
  assert.ok(sameName('Komm Hair', '비엔나 한인 미용실 Komm Hair'));
  assert.ok(sameName('Aladdin', 'Aladin Das Restaurant'));
  assert.ok(sameName("Gasometer Stub'n", 'Gasometer Stubn'));
  assert.ok(!sameName('Baran Style', 'Beyar Friseur'));
  assert.ok(!sameName('Friseur Kadir', 'Friseur Aras'), 'a shared generic word is not enough');
  assert.ok(!sameName('Cafe Horuck', 'Café Zwutschkerl'));
});

// Seen in the first dry run over all 1331 pages (2026-11-21).
test('sameName: a generic food or origin word is not a name', () => {
  assert.ok(!sameName('Mangal Kitchen', 'Yummy Kitchen'));
  assert.ok(!sameName('royal food', 'Royal India'));
  assert.ok(!sameName('Big Brother African Salon', 'Divine Imbiss African Kitchen'));
});

test('sameName: a short name standing whole inside the other', () => {
  assert.ok(sameName('5er', 'Cafe 5er'));
  assert.ok(sameName('as friseur', 'AS Frisör'));
  assert.ok(sameName('B&T', 'B&T Friseur'));
  assert.ok(sameName('B&B', 'Friseur B & B Damen Und Herren'));
});

// The 30 random pages checked by hand on Google Maps on 2026-11-21.
test('sample: venues Google Maps shows as open are confirmed', () => {
  for (const slug of ['the-nail-box', 'mali-thai-kueche', 'signore', 'gasthaus-am-platzl', 'plus-mobile', 'al-doumani',
    'gasometer-stub-n', 'alles-walzer-alles-wurst', 'no-27-malatang', 'angelina', 'kamelya', 'komm-hair'])
    assert.equal(verdictOf(slug).verdict, 'both', slug);
});

test('sample: a point placed a block away still matches by name and address', () => {
  const r = verdictOf('lili-s-wok-sushi-restaurant');
  assert.equal(r.verdict, 'both');
  assert.ok(r.match.distance > 80);
});

test('sample: closed in Overture', () => {
  const r = verdictOf('ocean-handy');
  assert.equal(r.verdict, 'closed');
  assert.equal(r.match.status, 'permanently_closed');
});

test('sample: another business of the same kind at the address', () => {
  assert.equal(verdictOf('susanne-hofmann').other.name, 'Mo Barbershop');
  assert.equal(verdictOf('cafe-horuck').other.name, 'Café Zwutschkerl');
});

test('sample: unknown to Overture stays osm-only', () => {
  for (const slug of ['jamila-coffee', 'hair-cut-one', 'handy-quellen']) assert.equal(verdictOf(slug).verdict, 'osm', slug);
});

test('match carries the Overture phone for the private list', () => {
  assert.equal(verdictOf('al-doumani').match.phone, '+4368110152599');
});

test('a venue without coordinates gets no verdict from Overture', () => {
  assert.deepEqual(overtureVerdict({ kind: 'cafe', name: 'X', street: 'Y 1' }, index), { verdict: 'osm' });
});

const hours = [null, [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1140], null];

test('withOverture hides hours unless both sources agree, and lifts its own mark later', () => {
  const f = { slug: 'x', hours, internal: { lat: 1 } };
  const hidden = withOverture(f, { verdict: 'osm' });
  assert.deepEqual(hidden.uncertain, ['hours']);
  assert.equal(hidden.internal.overture.hidHours, true);
  assert.equal(hidden.internal.lat, 1);
  const back = withOverture(hidden, { verdict: 'both' });
  assert.equal(back.uncertain, undefined);
  assert.equal(back.internal.overture.hidHours, undefined);
});

test('withOverture never lifts an uncertain mark it did not set', () => {
  const f = { hours, uncertain: ['hours', 'address'] };
  assert.deepEqual(withOverture(f, { verdict: 'both' }).uncertain, ['hours', 'address']);
  assert.equal(withOverture(f, { verdict: 'osm' }).internal.overture.hidHours, undefined);
});

test('statusAfter: closed pages are hidden once; Nasim can show them again; confirmed owners are never hidden', () => {
  assert.deepEqual(statusAfter({ status: 'public', verdict: 'closed' }), { status: 'hidden', hidPage: true });
  assert.deepEqual(statusAfter({ status: 'public', verdict: 'closed', hidPage: true }), { status: 'public', hidPage: true });
  assert.deepEqual(statusAfter({ status: 'public', verdict: 'closed', confirmed: true }), { status: 'public', hidPage: false });
  assert.deepEqual(statusAfter({ status: 'hidden', verdict: 'both', hidPage: true }), { status: 'public', hidPage: false });
  assert.deepEqual(statusAfter({ status: 'hidden', verdict: 'both' }), { status: 'hidden', hidPage: false }, 'hidden for another reason stays hidden');
});
