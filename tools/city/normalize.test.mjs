import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, normalizePhone, parseOpeningHours, siteKind } from './normalize.mjs';
import { slugBase, assignSlugs } from './slug.mjs';
import { zipDistrict, makeDistrictLocator } from './district.mjs';
import { chainReason, normName } from './chains.mjs';

test('kindOf maps OSM tags to our kinds', () => {
  assert.equal(kindOf({ amenity: 'fast_food' }), 'imbiss');
  assert.equal(kindOf({ amenity: 'restaurant' }), 'restaurant');
  assert.equal(kindOf({ amenity: 'cafe', shop: 'bakery' }), 'cafe');
  assert.equal(kindOf({ shop: 'hairdresser' }), 'friseur');
  assert.equal(kindOf({ shop: 'beauty', beauty: 'nails' }), 'nails');
  assert.equal(kindOf({ shop: 'beauty', name: 'Lady Diva Nails' }), 'nails');
  assert.equal(kindOf({ shop: 'beauty', beauty: 'cosmetics' }), 'kosmetik');
  assert.equal(kindOf({ shop: 'mobile_phone' }), 'handy');
  assert.equal(kindOf({ craft: 'electronics_repair' }), 'handy');
  assert.equal(kindOf({ shop: 'tailor' }), 'schneider');
  assert.equal(kindOf({ craft: 'dressmaker' }), 'schneider');
  assert.equal(kindOf({ shop: 'bakery' }), null);
  assert.equal(kindOf({ shop: 'hairdresser', hairdresser: 'dog' }), null);
});

test('normalizePhone gives E.164 for Austrian numbers', () => {
  assert.equal(normalizePhone('+43 1 8100399'), '+4318100399');
  assert.equal(normalizePhone('0660 4130063'), '+436604130063');
  assert.equal(normalizePhone('0043 (0)1 234 56 78'), '+4312345678');
  assert.equal(normalizePhone('+43 (0) 676 560 91 18'), '+436765609118');
  assert.equal(normalizePhone('01/9676893; +43 660 1234567'), '+4319676893');
  assert.equal(normalizePhone('+43-1-555-12-12'), '+4315551212');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(undefined), null);
});

const W = (o, c) => [o, c];
test('parseOpeningHours handles the common simple forms (Sunday first)', () => {
  assert.deepEqual(parseOpeningHours('Mo-Sa 09:00-19:00'), [null, W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1140)]);
  assert.deepEqual(parseOpeningHours('Mo-Fr 09:00-19:00; Sa 09:00-18:00'), [null, W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1140), W(540, 1080)]);
  assert.deepEqual(parseOpeningHours('Mo-Su,PH 11:00-22:00'), Array(7).fill(W(660, 1320)));
  assert.deepEqual(parseOpeningHours('11:00-23:00'), Array(7).fill(W(660, 1380)));
  assert.deepEqual(parseOpeningHours('Mo-Su 11:00-24:00'), Array(7).fill(W(660, 1440)));
  assert.deepEqual(parseOpeningHours('Fr-Sa 18:00-02:00'), [null, null, null, null, null, W(1080, 120), W(1080, 120)]);
  assert.deepEqual(parseOpeningHours('Mo-Su 10:00-22:00; We off'), [W(600, 1320), W(600, 1320), W(600, 1320), null, W(600, 1320), W(600, 1320), W(600, 1320)]);
  assert.deepEqual(parseOpeningHours('Su-Tu 10:00-12:00'), [W(600, 720), W(600, 720), W(600, 720), null, null, null, null]);
  assert.deepEqual(parseOpeningHours('24/7'), Array(7).fill(W(0, 1440)));
  assert.deepEqual(parseOpeningHours('Mo,We,Fr 08:30-12:00'), [null, W(510, 720), null, W(510, 720), null, W(510, 720), null]);
  assert.deepEqual(parseOpeningHours('Mo-Fr 09:00-18:00; PH off'), [null, W(540, 1080), W(540, 1080), W(540, 1080), W(540, 1080), W(540, 1080), null]);
});

test('parseOpeningHours returns null for forms one interval per day cannot hold', () => {
  assert.equal(parseOpeningHours('Mo-Fr 11:00-14:30,17:30-22:00'), null);
  assert.equal(parseOpeningHours('"nach Vereinbarung"'), null);
  assert.equal(parseOpeningHours('Jan-Mar Mo-Fr 09:00-17:00'), null);
  assert.equal(parseOpeningHours('Mo-Fr 09:00+'), null);
  assert.equal(parseOpeningHours('Mo-Fr 09:00-09:00'), null);
  assert.equal(parseOpeningHours('PH off'), null);
  assert.equal(parseOpeningHours(''), null);
});

test('siteKind tells own sites from social and platform links', () => {
  assert.equal(siteKind('https://www.friseurmeidling.at/'), 'own');
  assert.equal(siteKind('https://www.facebook.com/abc'), 'social');
  assert.equal(siteKind('instagram.com/abc'), 'social');
  assert.equal(siteKind('https://www.treatwell.at/ort/x/'), 'platform');
  assert.equal(siteKind('https://www.lieferando.at/speisekarte/x'), 'platform');
  assert.equal(siteKind('nonsense'), null);
});

test('slugBase transliterates and trims', () => {
  assert.equal(slugBase('Friseur Ali 1'), 'friseur-ali-1');
  assert.equal(slugBase('Meidlinger Knopfkönig'), 'meidlinger-knopfkoenig');
  assert.equal(slugBase('Café Größenwahn'), 'cafe-groessenwahn');
  assert.equal(slugBase('S&S Style In'), 's-s-style-in');
  assert.equal(slugBase("L'Ornella Çiğ Köfte"), 'l-ornella-cig-koefte');
  assert.equal(slugBase('杨国福麻辣烫'), '');
  assert.ok(slugBase('A'.repeat(30) + ' ' + 'B'.repeat(30)).length <= 32);
});

test('assignSlugs adds the district on collisions and avoids taken names', () => {
  const vs = [
    { id: 'a', name: 'Pizzeria Roma', kind: 'restaurant', district: 5, street: 'Margaretenstraße 1' },
    { id: 'b', name: 'Pizzeria Roma', kind: 'restaurant', district: 12, street: 'Schönbrunner Straße 9' },
    { id: 'c', name: 'Pizzeria Roma', kind: 'restaurant', district: 12, street: 'Wilhelmstraße 3' },
    { id: 'd', name: '杨国福麻辣烫', kind: 'imbiss', district: 1, street: 'Kärntner Straße 4' },
    { id: 'e', name: 'Www', kind: 'cafe', district: 3, street: 'Rennweg 1' },
    { id: 'f', name: 'Friseur Meidling', kind: 'friseur', district: 12, street: 'Meidlinger Hauptstraße 32' },
  ];
  const s = assignSlugs(vs, new Set(['friseur-meidling']));
  assert.equal(s.get('a'), 'pizzeria-roma-5');
  assert.equal(s.get('b'), 'pizzeria-roma-12-schoenbrunner-strasse');
  assert.equal(s.get('c'), 'pizzeria-roma-12-wilhelmstrasse');
  assert.equal(s.get('d'), 'imbiss-kaerntner-strasse-1');
  assert.equal(s.get('e'), 'www-cafe');
  assert.equal(s.get('f'), 'friseur-meidling-12');
  for (const v of s.values()) assert.match(v, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.equal(new Set(s.values()).size, s.size);
});

test('zipDistrict reads Vienna postcodes', () => {
  assert.equal(zipDistrict('1120'), 12);
  assert.equal(zipDistrict('1010'), 1);
  assert.equal(zipDistrict('1230'), 23);
  assert.equal(zipDistrict('1300'), null);
  assert.equal(zipDistrict('2340'), null);
});

test('district locator finds the polygon that holds a point', () => {
  const square = (ref, x0, y0) => ({ tags: { ref: String(ref), name: 'D' + ref }, members: [
    { type: 'way', role: 'outer', geometry: [{ lon: x0, lat: y0 }, { lon: x0 + 1, lat: y0 }, { lon: x0 + 1, lat: y0 + 1 }] },
    { type: 'way', role: 'outer', geometry: [{ lon: x0 + 1, lat: y0 + 1 }, { lon: x0, lat: y0 + 1 }, { lon: x0, lat: y0 }] },
  ] });
  const locate = makeDistrictLocator([square(1, 0, 0), square(2, 1, 0)]);
  assert.equal(locate(0.5, 0.5), 1);
  assert.equal(locate(1.5, 0.5), 2);
  assert.equal(locate(5, 5), null);
});

test('chainReason spots brands, known chains and repeated names', () => {
  assert.equal(chainReason({ name: "McDonald's", brand: "McDonald's" }), 'brand tag');
  assert.equal(chainReason({ name: 'Ströck' }), 'known chain');
  assert.equal(chainReason({ name: 'Bäckerei Ströck Filiale' }), 'known chain');
  assert.equal(chainReason({ name: 'Friseur Ali 1' }), null);
  const repeats = new Map([[normName('Pizza Mann'), 5]]);
  assert.equal(chainReason({ name: 'Pizza Mann' }, repeats), 'same name in 5 districts');
  assert.equal(chainReason({ name: 'Kebab' }, new Map([[normName('Kebab'), 9]])), null);
});

import { KINDS } from '../venues/schema.mjs';
import { kindLabel } from '../venues/i18n.mjs';
test('every kind the pipeline produces is a schema kind with DE and EN labels', () => {
  for (const k of ['imbiss', 'restaurant', 'cafe', 'friseur', 'nails', 'kosmetik', 'handy', 'schneider']) {
    assert.ok(KINDS.includes(k), k);
    assert.ok(kindLabel(k, 'de') && kindLabel(k, 'en'), k);
  }
});

test('chainReason leaves alone single venues that merely share a word with a chain', () => {
  for (const name of ['Weingut Hofer', "Hofer´s Gasthaus", 'Cafe Merkur', "L'Osteria del Collio", 'Zum kleinen Sacher']) {
    assert.equal(chainReason({ name }), null, name);
  }
  assert.equal(chainReason({ name: "L'Osteria" }), 'known chain');
  assert.equal(chainReason({ name: 'Café Sacher Wien' }), 'known chain');
  for (const name of ['Würstelstand', 'Wiener Würstelstand', 'Barber Shop', 'Änderungs-Schneiderei', 'Änderungsschneiderei']) {
    assert.equal(chainReason({ name }, new Map([[normName(name), 10]])), null, name);
  }
});
