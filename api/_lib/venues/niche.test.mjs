import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { nicheImage, allNicheNames } from './niche.mjs';

const v = (kind, cuisine, name = 'X', slug = 'x') => ({ slug, kind, name, ...(cuisine ? { cuisine } : {}) });
const name = (p) => p && p.replace('/v/_shared/niche/', '').replace('.webp', '');
// every slug a–t, so a rule is checked against every picture of its list, not one lucky hash
const all = (kind, cuisine, n) => new Set('abcdefghijklmnopqrst'.split('').map((s) => name(nicheImage(v(kind, cuisine, n, s)))));
const only = (set, allowed) => [...set].every((x) => allowed.includes(x));

test('a ladies or unisex salon never gets barber tools; a barber does', () => {
  const salon = all('friseur', null, 'Coiffeur Christina');
  assert.ok(!['barber', 'barber-razor', 'barber-clipper', 'beard-care'].some((x) => salon.has(x)), [...salon].join());
  assert.ok(only(all('friseur', null, 'Babos Barbershop'), ['barber', 'barber-razor', 'barber-clipper', 'barber-scissors', 'beard-care']));
  assert.ok(only(all('friseur', null, 'Herrenfriseur Ali'), ['barber', 'barber-razor', 'barber-clipper', 'barber-scissors', 'beard-care']));
});

test('an imbiss with no known food gets no picture (no paper bag); a restaurant gets a laid table', () => {
  assert.equal(nicheImage(v('imbiss', null, 'Buffet zum Freundlichen')), null);
  assert.equal(nicheImage(v('imbiss', 'sandwich', 'Ecke')), null);
  assert.ok(only(all('restaurant', null, 'Zum Hirschen'), ['table-setting', 'table-setting-2', 'table-setting-3']));
  assert.equal(nicheImage(v('restaurant', null, 'Oakberry Açai')), null, 'an açaí bar is no laid table');
});

test('a café shows coffee; cake, breakfast or nothing only when name or cuisine says so', () => {
  assert.ok(only(all('cafe', null, 'Café Hummel'), ['coffee', 'cappuccino', 'coffee-beans']));
  assert.ok(only(all('cafe', 'cake', 'Dolce'), ['cake', 'sachertorte', 'pastries']));
  assert.ok(only(all('cafe', null, 'Konditorei Oberlaa'), ['cake', 'sachertorte', 'pastries']));
  assert.ok(only(all('cafe', 'breakfast', 'Nelke'), ['breakfast', 'croissant']));
  assert.ok(only(all('cafe', 'austrian', 'Hübler'), ['coffee', 'cappuccino', 'sachertorte']));
  assert.equal(nicheImage(v('cafe', 'ice_cream', 'Perrella')), null);
  assert.equal(nicheImage(v('cafe', 'coffee_shop', 'Eissalon Tichy')), null);
  assert.equal(nicheImage(v('cafe', 'bubble_tea', 'Shodai')), null);
});

test('the name on the sign beats the OSM cuisine; the earliest word wins', () => {
  assert.ok(only(all('restaurant', 'barbecue', 'Hendl König'), ['chicken', 'fried-chicken']));
  assert.ok(only(all('imbiss', 'coffee_shop', 'Pamir Pizza & Kebab'), ['pizza', 'pizza-2', 'pizza-3']));
  assert.ok(only(all('imbiss', 'chicken', "Baki's Schnitzelparadies"), ['schnitzel', 'schnitzel-2']));
  assert.ok(only(all('restaurant', 'breakfast;barbecue', 'Paul und Anna'), ['breakfast', 'croissant']));
  assert.equal(name(nicheImage(v('restaurant', 'international', '1516 Brewing Company'))), 'beer-pretzel');
  assert.equal(name(nicheImage(v('restaurant', 'regional', 'Wieden Bräu'))), 'beer-pretzel');
});

test('cosmetics: care, not perfume or make-up; the name can say nails, brows or massage', () => {
  assert.ok(only(all('kosmetik', null, 'la bella Bianca'), ['cosmetics-jars', 'jade-roller', 'face-mask']));
  assert.ok(only(all('kosmetik', null, 'Lash & Brow Studio'), ['brow-lash']));
  assert.ok(only(all('kosmetik', null, 'Thai Massage Sabai'), ['massage']));
  assert.equal(name(nicheImage(v('nails', null, "Moni's Nagel- und Fußpflege-Studio"))), 'pedicure');
  assert.equal(name(nicheImage(v('kosmetik', null, 'Christa Fußpflege'))), 'pedicure');
});

test('Austrian food: Schnitzel and Gulasch, no regional guess; known cuisines keep their dishes', () => {
  assert.ok(only(all('restaurant', 'austrian', 'Beisl'), ['schnitzel', 'schnitzel-2', 'goulash']));
  assert.ok(only(all('imbiss', 'kebab;pizza', 'Ova'), ['doener', 'dueruem', 'kebab', 'adana']));
  assert.equal(name(nicheImage(v('restaurant', 'thai', 'All Reis'))), 'thai-curry');
  assert.equal(name(nicheImage(v('imbiss', 'korean;unknown', 'Ko:on'))), 'bibimbap');
  // only the first cuisine decides: "french;italian" is no Italian place, so no pasta; an imbiss then gets nothing
  assert.ok(only(all('restaurant', 'french;german;italian', 'Seven North'), ['table-setting', 'table-setting-2', 'table-setting-3']));
  assert.equal(nicheImage(v('imbiss', 'unknown;korean', 'Y')), null);
  assert.ok(only(all('handy', null, 'Mobile Shop'), ['phone-repair', 'phone-accessories']));
  assert.equal(nicheImage(v('other', null, 'Y')), null);
});

test('the same page always gets the same picture; neighbours can differ', () => {
  assert.equal(nicheImage(v('friseur', null, 'K', 'kardash')), nicheImage(v('friseur', null, 'K', 'kardash')));
  assert.ok(all('friseur', null, 'Salon').size > 1);
});

test('every picture the tables name is in v/_shared/niche, and every file there is used', () => {
  const names = allNicheNames();
  for (const n of names) assert.ok(existsSync(new URL(`../../../v/_shared/niche/${n}.webp`, import.meta.url)), n);
  const files = readdirSync(new URL('../../../v/_shared/niche/', import.meta.url)).map((f) => f.replace('.webp', ''));
  assert.deepEqual(files.filter((f) => !names.includes(f)), []);
});
