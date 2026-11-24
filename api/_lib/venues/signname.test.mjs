import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signName, signSize } from './signname.mjs';

const is = (name, pre, main, sub = '') => assert.deepEqual(signName(name), { pre, main, sub }, name);

test('a trade word at the start or end goes small above the name', () => {
  is('Cafe Legend', 'Cafe', 'Legend');
  is('Gasthaus zum Agnesbrünnl', 'Gasthaus', 'zum Agnesbrünnl');
  is('Mosa Barber', 'Barber', 'Mosa');
  is('Viva la Vita Pizzeria Trattoria', 'Pizzeria Trattoria', 'Viva la Vita');
});

test('a trade word that is part of the name stays', () => {
  is('Good Morning Vietnam', '', 'Good Morning Vietnam');
  is('Atelier 7 The Café', '', 'Atelier 7 The Café');
  is('Vegan Market & Asian Bistro', '', 'Vegan Market & Asian Bistro');
  is('Döner Kebap', '', 'Döner Kebap');
  is('Romuliana Grill', '', 'Romuliana Grill');
  is('Cafe Restaurant', '', 'Cafe Restaurant');
  is('as friseur', '', 'as friseur');
  is('Haar|Scharf', '', 'Haar|Scharf');
});

test('separators, brackets, quotes and commas: the first part is the name, the rest goes below', () => {
  is('Stella Eissalon / Konditorei / Kaffeehaus', 'Eissalon', 'Stella', 'Konditorei · Kaffeehaus');
  is('GARY - Styling & Trends', '', 'GARY', 'Styling & Trends');
  is('CAY (Cafe am Yppenplatz)', '', 'CAY', 'Cafe am Yppenplatz');
  is('Heurigenschank "Zum Berger"', 'Heurigenschank', 'Zum Berger');
  is('Das Hodzic, Cafe - Restaurant', '', 'Das Hodzic', 'Cafe · Restaurant');
  is('Sabine Pawlik / Christian Pulker', '', 'Sabine Pawlik / Christian Pulker');
});

test('the city goes below; company forms leave the sign', () => {
  is('Il Centro Graz', '', 'Il Centro', 'Graz');
  is('Kolmans e.U.', '', 'Kolmans');
  is('Chinarestaurant Sunny (Golden Palace China-Restaurant Betriebs GmbH)', 'Chinarestaurant', 'Sunny');
});

test('size: a long name takes at most two lines, a short one is held back', () => {
  assert.ok(signSize('Bert').cqi === signSize('Bertam').cqi, 'four letters are no bigger than six');
  assert.ok(signSize('Barbara Reichard Frisuren & Schönheitswerkstatt').cqi < signSize('Gasthaus Bauer').cqi);
  assert.ok(signSize('Schönheitswerkstatt').cqi * 19 * 0.52 <= 100, 'the longest word fits one line');
});
