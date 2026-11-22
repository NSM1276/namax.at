import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, CITY_ORDER, cityOf, cityByName, districtLabel, districtNumber, toRoman } from './cities.mjs';

test('Wien comes first; every city has a name and an OSM relation', () => {
  assert.equal(CITY_ORDER[0], 'wien');
  for (const k of CITY_ORDER) { assert.ok(CITIES[k].name); assert.ok(Number.isInteger(CITIES[k].osm)); }
});

test('records without a city are Vienna records', () => {
  assert.equal(cityOf({ internal: { district: 12 } }), 'wien');
  assert.equal(cityOf({}), 'wien');
  assert.equal(cityOf(null), 'wien');
  assert.equal(cityOf({ internal: { city: 'graz' } }), 'graz');
  assert.equal(cityOf({ internal: { city: 'nowhere' } }), 'wien', 'an unknown city key falls back to Vienna');
});

test('a city found by the name on the address', () => {
  assert.equal(cityByName('Wien'), 'wien');
  assert.equal(cityByName('graz'), 'graz');
  assert.equal(cityByName('Mödling'), null);
});

test('district labels: Vienna "12. Meidling", Graz in Roman numerals "III. Geidorf"', () => {
  assert.equal(districtLabel('wien', 12), '12. Meidling');
  assert.equal(districtLabel('graz', 3), 'III. Geidorf');
  assert.equal(districtLabel('graz', 17), 'XVII. Puntigam');
  assert.equal(districtLabel('wien', 99), '99. Bezirk');
  assert.equal(toRoman(14), 'XIV');
});

test('the 17 Graz districts are found by their OSM names', () => {
  assert.equal(Object.keys(CITIES.graz.districts).length, 17);
  assert.equal(districtNumber('graz', { name: 'Sankt Leonhard' }), 2);
  assert.equal(districtNumber('graz', { name: 'St. Peter' }), 8);
  assert.equal(districtNumber('graz', { name: 'Gösting' }), 13);
  assert.equal(districtNumber('graz', { name: 'Katastralgemeinde Gösting' }), null);
  assert.equal(districtNumber('wien', { ref: '12', name: 'Meidling' }), 12, 'Vienna boundaries carry the number');
});

test('Linz and Salzburg parts have no numbers: the name alone, found by its OSM name; refs are not district numbers there', () => {
  assert.equal(districtLabel('salzburg', districtNumber('salzburg', { name: 'Parsch' })), 'Parsch');
  assert.equal(districtLabel('linz', districtNumber('linz', { name: 'Urfahr' })), 'Urfahr');
  assert.equal(districtNumber('linz', { name: 'St. Magdalena', ref: '4' }), 15, 'a ref outside Vienna is ignored');
  assert.equal(Object.keys(CITIES.linz.districts).length, 16);
  assert.equal(Object.keys(CITIES.salzburg.districts).length, 27);
});

test('Innsbruck: 9 Katastralgemeinden; the one OSM names "Innsbruck" is the Innenstadt', () => {
  assert.equal(districtLabel('innsbruck', districtNumber('innsbruck', { name: 'Innsbruck' })), 'Innenstadt');
  assert.equal(districtLabel('innsbruck', districtNumber('innsbruck', { name: 'Wilten' })), 'Wilten');
  assert.ok(CITIES.innsbruck.zip.test('6080') && CITIES.innsbruck.zip.test('6020') && !CITIES.innsbruck.zip.test('6060'));
});
