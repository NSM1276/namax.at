import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderVenue, esc, ownerBar, districtLine } from './template.mjs';
const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('full venue renders every block', () => {
  const html = renderVenue(load('full'));
  for (const s of ['<h1', 'Friseur Meidling', 'Haarschnitt', '15', 'Stand: 11/2026', '4,9', '157', 'tel:+436604130063', 'data-status'])
    assert.ok(html.includes(s), s);
  const own = renderVenue(load('full'), { owner: ownerBar() });
  for (const s of ['data-owner', 'data-chat-hook', 'class="has-owner"']) assert.ok(own.includes(s), s);
});
test('minimal venue renders without leftovers', () => {
  const html = renderVenue(load('minimal'));
  assert.doesNotMatch(text(html), /undefined|null|NaN|\[object/);
  for (const s of ['id="liste"', 'tel:', 'data-photos', 'Bewertungen', 'data-status'])
    assert.ok(!html.includes(s), s);
});
test('venue text is escaped', () => {
  const html = renderVenue({ ...load('minimal'), name: '"Best" <Kebap> & S&S L\'adovin' });
  assert.ok(html.includes('&quot;Best&quot; &lt;Kebap&gt; &amp; S&amp;S L&#39;adovin'));
  assert.ok(!html.includes('<Kebap>'));
  assert.equal(esc('</script>'), '&lt;/script&gt;');
});
test('hidden has noindex and the unconfirmed line; public has neither', () => {
  const hidden = renderVenue({ ...load('full'), status: 'hidden' });
  const pub = renderVenue({ ...load('full'), status: 'public', confirmed: true });
  assert.match(hidden, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(hidden.includes('Angaben nicht vom Inhaber bestätigt'));
  assert.doesNotMatch(pub, /noindex/);
  assert.ok(!pub.includes('nicht vom Inhaber bestätigt'));
  assert.ok(pub.includes('<link rel="canonical" href="https://friseur-meidling.namax.at/">'));
});
test('internal notes and external hosts never reach the page', () => {
  const v = load('full'); v.internal = { owner: 'SECRET-OWNER', sources: ['SECRET-SRC'], notes: 'SECRET-NOTE' };
  const html = renderVenue(v);
  assert.doesNotMatch(html, /SECRET-/);
  const hosts = [...html.matchAll(/(?:src|href)="https?:\/\/([^/"]+)/g)].map((m) => m[1]);
  for (const h of hosts) assert.ok(['www.namax.at', 'wa.me', 'www.google.com', 'friseur-meidling.namax.at'].includes(h), h);
  assert.doesNotMatch(html, /url\(\s*['"]?https?:/);
});
test('list title follows the kind; prices use a comma', () => {
  assert.ok(renderVenue({ ...load('full'), kind: 'imbiss' }).includes('Speisekarte'));
  assert.ok(renderVenue({ ...load('full'), kind: 'handy' }).includes('Reparatur &amp; Preise'));
  const v = load('full'); v.list.groups[0].items[0].price = 9.9;
  assert.ok(renderVenue(v).includes('9,90'));
});
test('unknown theme throws; missing theme uses the default', () => {
  assert.throws(() => renderVenue({ ...load('minimal'), theme: { palette: 'nope', lettering: 'block' } }));
  assert.doesNotThrow(() => renderVenue(load('minimal')));
});
test('both languages are present for the toggle', () => {
  const html = renderVenue(load('full'));
  assert.ok(html.includes('Haircut') && html.includes('Open now') && html.includes('Jetzt geöffnet'));
});
test('a string in a data attribute cannot close the attribute or a script', () => {
  const v = load('full'); v.list.groups[0].items[0].name = { de: 'A"><script>x</script>', en: "B'</script>" };
  const html = renderVenue(v);
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes("B'</script>"));
});
test('item without price shows no euro sign for it; photos render when present', () => {
  const v = load('full'); v.list.groups[0].items = [{ name: 'Beratung', price: null }];
  assert.doesNotMatch(text(renderVenue(v)), /Beratung\s*€|null/);
  const p = load('full'); p.photos = ['p1.jpg', 'p2.jpg'];
  const html = renderVenue(p);
  assert.ok(html.includes('data-photos') && (html.match(/<img /g) || []).length === 2);
});
test('a long word in the name shrinks the title so it fits a phone', () => {
  const long = renderVenue({ ...load('minimal'), name: 'Änderungsschneiderei Fa. Orhan' });
  const m = /<h1 lang="de" style="font-size:clamp\(20px,([\d.]+)vw,80px\);font-size:min\(80px,([\d.]+)cqi\)">/.exec(long);
  assert.ok(m, 'long name gets an inline size');
  // Barlow Condensed bold capitals are about 0.5em wide; inside the rim a 375px phone leaves about 290px
  assert.ok(Number(m[1]) * 3.75 * 20 * 0.5 <= 290, 'Änderungsschneiderei fits inside the rim at 375px wide');
  assert.ok(Number(m[2]) * 20 * 0.5 <= 100, 'and fits the rim at any width, whatever the hyphenation');
  assert.match(long, /\.rim\{[^}]*container-type:inline-size/);
  assert.match(renderVenue({ ...load('minimal'), name: 'Adonis' }), /<h1 lang="de">Adonis<\/h1>/);
});
test('the name keeps German hyphenation when the page switches to EN', () => {
  assert.match(renderVenue(load('full')), /<h1 lang="de"[ >]/);
});
test('desktop: actions sit in a side card, the rest in the main column, phone order unchanged', () => {
  const html = renderVenue(load('full'));
  assert.match(html, /<aside class="side">[\s\S]*data-status[\s\S]*class="actions"[\s\S]*<\/aside><div class="col">[\s\S]*id="liste"[\s\S]*<\/div>\s*<footer>/);
  assert.match(html, /@media \(min-width:900px\)\{[^@]*?\.page\{display:grid/);
});

test('the sign says what kind of place it is, in both languages, even when nothing else is known', () => {
  const v = { ...load('minimal'), kind: 'handy', area: 'Meidling' };
  const html = renderVenue(v);
  const plate = /<div class="plate">([\s\S]*?)<\/header>/.exec(html)[1];
  assert.match(plate, /data-de="Handyshop"/);
  assert.match(plate, /data-en="Phone shop"/);
  assert.match(plate, /MEIDLING/);
  assert.match(html, /<title>[^<]*Handyshop[^<]*<\/title>/);
});

test('map buttons: Google by default, Apple Maps on iPhone (no App Store detour), place view for the map link', () => {
  const html = renderVenue({ ...load('minimal'), name: 'A & B', address: { street: 'Gasse 1', zip: '1120', city: 'Wien' } });
  const q = encodeURIComponent('A & B, Gasse 1, 1120 Wien');
  assert.ok(html.includes(`href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}"`), 'route: Google directions');
  assert.ok(html.includes(`data-apple="https://maps.apple.com/?daddr=${q}"`), 'route: Apple directions on iPhone');
  assert.ok(html.includes(`href="https://www.google.com/maps/search/?api=1&amp;query=${q}"`), 'map link: Google place');
  assert.ok(html.includes(`data-apple="https://maps.apple.com/?q=${q}"`), 'map link: Apple place on iPhone');
  assert.match(html, /iPhone\|iPad\|iPod/);
  assert.doesNotMatch(html, /In Google Maps öffnen/);
});

test('brand faces are declared and used for headings and body', () => {
  const html = renderVenue(load('minimal'));
  for (const s of ['font-family:NamaxDisplay', 'font-family:NamaxText', 'barlow-condensed-latin-700.woff2', 'barlow-condensed-latin-ext-700.woff2', 'figtree-latin-400.woff2', 'figtree-latin-700.woff2'])
    assert.ok(html.includes(s), s);
  assert.match(html, /--body:NamaxText/);
  assert.match(html, /--display:NamaxDisplay/);
  assert.doesNotMatch(html, /anton-latin|archivo-narrow-latin/, 'old faces are not loaded any more');
});

test('the sign is a Viennese enamel plate: rim, screws, gleam, kind, name, district', () => {
  const html = renderVenue({ ...load('minimal'), kind: 'handy', area: 'Meidling', address: { street: 'Gasse 1', zip: '1120', city: 'Wien' } });
  const sign = /<header class="sign">([\s\S]*?)<\/header>/.exec(html)[1];
  for (const part of ['class="plate"', 'class="rim"', 'class="gleam"', '<h1 lang="de"', 'class="kind"', 'class="district"', '12., MEIDLING']) assert.ok(sign.includes(part), part);
  assert.equal((sign.match(/class="screw/g) || []).length, 2);
  assert.match(html, /\.plate\{[^}]*background:var\(--sign-bg\)/);
  assert.match(html, /\.rim\{[^}]*border:3px solid var\(--sign-ink\)/);
});

test('district line: Vienna district number from the post code, otherwise the area', () => {
  assert.equal(districtLine({ area: 'Meidling', address: { zip: '1120', city: 'Wien' } }), '12., MEIDLING');
  assert.equal(districtLine({ area: 'Innere Stadt', address: { zip: '1010', city: 'Wien' } }), '1., INNERE STADT');
  assert.equal(districtLine({ area: 'Liesing', address: { zip: '1230', city: 'Wien' } }), '23., LIESING');
  assert.equal(districtLine({ area: 'Mödling', address: { zip: '2340', city: 'Mödling' } }), 'MÖDLING');
  assert.equal(districtLine({ address: { zip: '1120', city: 'Wien' } }), '12. BEZIRK');
});

test('district line and title in Graz: Roman district number, district name and the city', () => {
  assert.equal(districtLine({ area: 'Geidorf', address: { zip: '8010', city: 'Graz' } }), 'III. GEIDORF, GRAZ');
  assert.equal(districtLine({ area: 'St. Leonhard', address: { zip: '8010', city: 'Graz' } }), 'II. ST. LEONHARD, GRAZ');
  assert.equal(districtLine({ area: 'Puntigam', address: { zip: '8055', city: 'Graz' } }), 'XVII. PUNTIGAM, GRAZ');
  const html = renderVenue({ ...load('minimal'), kind: 'cafe', area: 'Lend', address: { street: 'Mariahilferstraße 1', zip: '8020', city: 'Graz' } });
  assert.match(html, /<title>[^<]*, Lend, Graz<\/title>/);
  assert.match(html, /IV\. LEND, GRAZ/);
  assert.doesNotMatch(html, /Wien/, 'nothing on a Graz page says Vienna');
  const wien = renderVenue({ ...load('minimal'), kind: 'cafe', area: 'Meidling', address: { street: 'Gasse 1', zip: '1120', city: 'Wien' } });
  assert.match(wien, /<title>[^<]*, Meidling<\/title>/, 'Vienna titles stay as they were');
});

test('motion: plays once, nothing moves with reduced motion, and the page is readable without animation', () => {
  const html = renderVenue(load('minimal'));
  assert.match(html, /@keyframes swing/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none/);
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1].replace(/@keyframes [a-z-]+\{(?:[^{}]*\{[^}]*\})+\}/g, '');
  assert.doesNotMatch(css, /opacity:0[;}]/, 'no element waits invisible for an animation');
});

test('a facade photo shows under the plate at a fixed 4:3 size; without one there is nothing', () => {
  const url = 'https://abc.public.blob.vercel-storage.com/venues/x/facade-1.jpg';
  const html = renderVenue({ ...load('minimal'), facade: url });
  assert.match(html, new RegExp(`<figure class="facade"><img src="${url.replace(/[./]/g, '\$&')}"[^>]* width="1600" height="1200"`));
  assert.ok(html.indexOf('class="facade"') > html.indexOf('</header>'));
  assert.ok(!renderVenue(load('minimal')).includes('class="facade"'));
  assert.ok(!renderVenue({ ...load('minimal'), facade: 'javascript:alert(1)' }).includes('class="facade"'), 'only Blob https urls');
});

test('merge: the stored facade url reaches the page', async () => {
  const { effectiveVenue } = await import('./merge.mjs');
  const rec = { slug: 'a', status: 'public', facts: load('minimal'), changes: {}, confirmedAt: null, facadeUrl: 'https://x.public.blob.vercel-storage.com/f.jpg' };
  assert.equal(effectiveVenue(rec).facade, 'https://x.public.blob.vercel-storage.com/f.jpg');
  assert.equal(effectiveVenue({ ...rec, facadeUrl: null }).facade, undefined);
});

// schema.org block for search engines: only what the page itself shows.
const ld = (html) => { const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; };

test('schema.org: type, name, address, phone, page and opening hours of the venue', () => {
  const j = ld(renderVenue({ ...load('full'), status: 'public' }));
  assert.equal(j['@context'], 'https://schema.org');
  assert.equal(j['@type'], 'HairSalon');
  assert.equal(j.name, 'Friseur Meidling');
  assert.equal(j.url, 'https://friseur-meidling.namax.at/');
  assert.deepEqual(j.address, { '@type': 'PostalAddress', streetAddress: 'Meidlinger Hauptstraße 32', postalCode: '1120', addressLocality: 'Wien', addressCountry: 'AT' });
  assert.equal(j.telephone, '+436604130063');
  assert.deepEqual(j.openingHoursSpecification, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '19:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '18:00' },
  ]);
  assert.equal(j.aggregateRating, undefined, 'ratings from Google are not ours to mark up');
});

test('schema.org: no phone or hours when the page shows none; every kind has a type', () => {
  const m = load('minimal');
  const j = ld(renderVenue({ ...m, phone: undefined, hours: undefined }));
  assert.equal(j.telephone, undefined);
  assert.equal(j.openingHoursSpecification, undefined);
  const types = {};
  for (const kind of ['friseur', 'cafe', 'restaurant', 'imbiss', 'handy', 'kosmetik', 'nails', 'schneider']) types[kind] = ld(renderVenue({ ...m, kind }))['@type'];
  assert.deepEqual(types, { friseur: 'HairSalon', cafe: 'CafeOrCoffeeShop', restaurant: 'Restaurant', imbiss: 'FastFoodRestaurant',
    handy: 'Store', kosmetik: 'BeautySalon', nails: 'NailSalon', schneider: 'LocalBusiness' });
});

test('schema.org: after midnight and until midnight; a name with </script> cannot break out', () => {
  const m = load('minimal');
  const j = ld(renderVenue({ ...m, name: 'X</script><b>', hours: [[1080, 120], null, null, null, null, null, [600, 1440]] }));
  assert.equal(j.name, 'X</script><b>');
  assert.deepEqual(j.openingHoursSpecification, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '10:00', closes: '23:59' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday'], opens: '18:00', closes: '02:00' },
  ]);
  assert.ok(!renderVenue({ ...m, name: 'X</script><b>' }).includes('X</script><b>'));
test('district line in Salzburg: the Stadtteil name and the city, no number', () => {
  assert.equal(districtLine({ area: 'Parsch', address: { zip: '5020', city: 'Salzburg' } }), 'PARSCH, SALZBURG');
  assert.equal(districtLine({ area: 'Urfahr', address: { zip: '4040', city: 'Linz' } }), 'URFAHR, LINZ');
});
