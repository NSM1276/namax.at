import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDistrictLocator, zipDistrict } from './district.mjs';
import { assignSlugs } from './slug.mjs';
import { cityPaths, overpassQuery } from './paths.mjs';

// A square boundary relation in Overpass "out geom" shape.
const square = (tags, x0, y0, x1, y1) => ({ tags, members: [{ geometry: [
  { lon: x0, lat: y0 }, { lon: x1, lat: y0 }, { lon: x1, lat: y1 }, { lon: x0, lat: y1 }, { lon: x0, lat: y0 }] }] });

test('Graz districts are located by their OSM names; land outside every district is null', () => {
  const locate = makeDistrictLocator([square({ name: 'Geidorf' }, 15.43, 47.08, 15.45, 47.09),
    square({ name: 'Sankt Peter' }, 15.46, 47.04, 15.48, 47.06), square({ name: 'Katastralgemeinde Lend' }, 0, 0, 1, 1)], 'graz');
  assert.equal(locate(15.44, 47.085), 3);
  assert.equal(locate(15.47, 47.05), 8);
  assert.equal(locate(0.5, 0.5), null, 'boundaries that are not districts are ignored');
});

test('Vienna districts keep coming from the ref number', () => {
  const locate = makeDistrictLocator([square({ ref: '12', name: 'Meidling' }, 16.3, 48.16, 16.34, 48.18)]);
  assert.equal(locate(16.32, 48.17), 12);
});

test('the post code tells the district only in Vienna', () => {
  assert.equal(zipDistrict('1120'), 12);
  assert.equal(zipDistrict('1120', 'wien'), 12);
  assert.equal(zipDistrict('8010', 'graz'), null);
  assert.equal(zipDistrict('1120', 'graz'), null);
});

const v = (id, name, district, street = 'Gasse 1') => ({ id, name, kind: 'restaurant', district, street });

test('Graz: a name free everywhere stays bare; a name already used gets the city, not a district number', () => {
  const s = assignSlugs([v('a', 'Pizza Roma', 3), v('b', 'Gasthaus Zum Kreuz', 4)], new Set(['pizza-roma']), { city: 'graz' });
  assert.equal(s.get('a'), 'pizza-roma-graz');
  assert.equal(s.get('b'), 'gasthaus-zum-kreuz');
});

test('Graz: a name shared inside Graz gets the city and the district name; inside one district the street too', () => {
  const s = assignSlugs([v('a', 'Kebab Haus', 4), v('b', 'Kebab Haus', 5), v('c', 'Sushi Ya', 6, 'Jakoministraße 3'), v('d', 'Sushi Ya', 6, 'Grazbachgasse 9')],
    new Set(), { city: 'graz' });
  assert.equal(s.get('a'), 'kebab-haus-graz-lend');
  assert.equal(s.get('b'), 'kebab-haus-graz-gries');
  assert.equal(s.get('c'), 'sushi-ya-graz-jakomini-jakoministrasse');
  assert.equal(s.get('d'), 'sushi-ya-graz-jakomini-grazbachgasse');
});

test('Graz: "-graz" already taken by another page gets a number, never a duplicate', () => {
  const s = assignSlugs([v('a', 'Pizza Roma', 3)], new Set(['pizza-roma', 'pizza-roma-graz']), { city: 'graz' });
  assert.equal(s.get('a'), 'pizza-roma-graz-2');
});

test('Vienna slugs are made exactly as before', () => {
  const s = assignSlugs([v('a', 'Pizza Roma', 12), v('b', 'Pizza Roma', 10), v('c', 'Solo', 3)], new Set(['solo']));
  assert.deepEqual([...s.values()], ['pizza-roma-12', 'pizza-roma-10', 'solo-3']);
});

test('file names per city; Vienna keeps the old ones', () => {
  assert.equal(cityPaths('wien').osm, 'data/raw/osm-wien.json');
  assert.equal(cityPaths('wien').districts, 'data/raw/osm-districts.json');
  assert.equal(cityPaths('wien').venues, 'data/city/venues.json');
  assert.equal(cityPaths('graz').osm, 'data/raw/osm-graz.json');
  assert.equal(cityPaths('graz').districts, 'data/raw/osm-graz-districts.json');
  assert.equal(cityPaths('graz').addresses, 'data/raw/osm-graz-addresses.json');
  assert.equal(cityPaths('graz').venues, 'data/cities/graz/venues.json');
  assert.equal(cityPaths('graz').overture, 'data/places/overture-graz.json');
  assert.throws(() => cityPaths('atlantis'));
});

test('Overpass queries are filled in with the city area and its district level', () => {
  const q = overpassQuery('area({{AREA}})->.city;rel(area.city)["admin_level"="{{LEVEL}}"];', 'graz');
  assert.equal(q, 'area(3600034719)->.city;rel(area.city)["admin_level"="9"];');
  assert.match(overpassQuery('area({{AREA}})', 'wien'), /3600109166/);
});

test('chains: a name in 3 districts is a chain in a city of 17 small districts, not yet in Vienna; Graz chains are known', async () => {
  const { chainReason } = await import('./chains.mjs');
  const repeats = new Map([['schnittig', 3]]);
  assert.equal(chainReason({ name: 'Schnittig' }, repeats), null, 'Vienna keeps its 4-district rule');
  assert.equal(chainReason({ name: 'Schnittig' }, repeats, 3), 'same name in 3 districts');
  for (const name of ['Martin Auer', 'dm Frisör', 'Zu den 3 goldenen Kugeln', "Barista's", 'Mensa Café']) assert.equal(chainReason({ name }), 'known chain', name);
  assert.equal(chainReason({ name: 'Pizzeria' }, new Map([['pizzeria', 9]]), 3), null, 'generic names never');
});
