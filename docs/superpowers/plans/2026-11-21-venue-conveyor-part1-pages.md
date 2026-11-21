# Venue Conveyor, Part 1: Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command turns a facts file per venue into a finished, hidden, bilingual page served at `<slug>.namax.at`.

**Architecture:** Plain Node ESM scripts, no dependencies, same style as `tools/build-pages.mjs`. Facts live in `venues/<slug>.json` (not deployed). `node tools/build-venues.mjs` validates them and writes self-contained static HTML to `v/<slug>/index.html` (deployed, committed). `vercel.json` maps the host `<slug>.namax.at` to `/v/<slug>/`.

**Tech Stack:** Node 25 ESM, `node:test`, `node:assert/strict`, static HTML/CSS/vanilla JS, Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-11-21-venue-conveyor-design.md`

**This is part 1 of 3.** Part 2 (assistant: Postgres, Vercel Blob, Haiku chat on the owner link, view counter) and part 3 (Telegram bot) get their own plans after this one works. Part 1 leaves a clearly marked hook for the chat button and for photos.

## Global Constraints

- No npm dependencies, no build framework. Scripts run with bare `node`.
- Pages make no external requests except fonts from `https://www.namax.at/v/_shared/fonts/`.
- Every page is German + English on one URL with a DE/EN toggle; language choice is stored in `localStorage` inside `try/catch`.
- Nothing is invented: a block whose data is missing is not rendered. No stock photos, no counters, no testimonials.
- No third-party photos or logos. Text and styling only; photo slots stay empty in part 1.
- Status `hidden` pages carry `<meta name="robots" content="noindex, nofollow">`. Status `public` pages do not. Status `removed` pages have no output at all.
- While a venue is not confirmed, the footer shows exactly: `Website von namax.at · Angaben nicht vom Inhaber bestätigt` (EN: `Website by namax.at · Details not confirmed by the owner`).
- Prices and rating are shown with their date (`Stand: MM/YYYY`).
- Imprint and privacy links point to `https://www.namax.at/impressum` and `https://www.namax.at/datenschutz`.
- **No deploy and no push in this plan.** Nasim deploys in batches himself.
- Commits: ask Nasim once before Task 1 whether to commit per task on a branch `venue-conveyor`. If he says no, skip every commit step.

## Review Focus

1. **Missing data.** A venue with no hours, no price list, no rating or no phone must render cleanly, with the block gone and no `undefined`, `null` or empty heading on the page. → tests in Task 3.
2. **Hostile or awkward text.** Names such as `S&S Style In Hairsalon`, `L'adovin`, `"Best" <Kebap>` must appear literally and never break the HTML. → tests in Task 3.
3. **Hours past midnight and closed days.** A kebab shop open 10:00–02:00 is open at 01:00 the next calendar day; a closed Monday shows as closed. → tests in Task 2.
4. **Bad or colliding slugs.** `www`, `mail-in`, `test`, uppercase, umlauts, a slug that differs from the file name, or two files with the same slug must stop the build with a message naming the file. → tests in Task 1 and Task 4.
5. **Status changes.** Changing `hidden` to `removed`, or deleting the facts file, must delete `v/<slug>/` on the next build; `public` must never contain `noindex`. → tests in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `venues/<slug>.json` | Facts for one venue (source of truth, not deployed) |
| `tools/venues/schema.mjs` | `validateVenue`, slug rules, list of kinds |
| `tools/venues/hours.mjs` | Opening-hours logic, used at build time and inlined into the page |
| `tools/venues/i18n.mjs` | UI strings DE/EN, list-block titles per kind |
| `tools/venues/themes.mjs` | Palettes and lettering presets |
| `tools/venues/template.mjs` | `renderVenue(venue) → string` |
| `tools/build-venues.mjs` | CLI: read, validate, write, delete |
| `tools/venues/*.test.mjs` | Tests |
| `tools/venues/fixtures/*.json` | Test venues |
| `v/<slug>/index.html` | Generated page (committed, deployed) |
| `v/_shared/fonts/*.woff2` | Fonts for venue pages |
| `tools/serve.mjs` | Modify: map `<slug>.localhost` to `/v/<slug>/` |
| `vercel.json`, `.vercelignore` | Modify: host routing, CORS for fonts, ignore `venues` |

Run all tests with: `node --test tools/venues/`

---

### Task 1: Venue schema and validation

**Files:**
- Create: `tools/venues/schema.mjs`, `tools/venues/schema.test.mjs`, `tools/venues/fixtures/full.json`, `tools/venues/fixtures/minimal.json`

**Interfaces:**
- Produces: `KINDS: string[]`, `RESERVED_SLUGS: string[]`, `validateVenue(venue: object, fileSlug: string): string[]` (empty array = valid; each string is a human-readable error).

Venue shape (only `slug`, `status`, `kind`, `name`, `address` are required):

```js
{
  slug: 'friseur-meidling',            // ^[a-z0-9]+(-[a-z0-9]+)*$, 3–40 chars, equals file name
  status: 'hidden',                    // 'hidden' | 'public' | 'removed'
  kind: 'friseur',                     // one of KINDS
  name: 'Friseur Meidling',
  area: 'Meidling · Meidlinger Hauptstraße',
  address: { street: 'Meidlinger Hauptstraße 32', zip: '1120', city: 'Wien' },
  phone: '+436604130063',              // E.164, optional
  hours: [null, [540,1140], [540,1140], [540,1140], [540,1140], [540,1140], [540,1080]],
                                       // index 0 = Sunday; null = closed; [open, close] in minutes;
                                       // close <= open means it closes after midnight
  rating: { value: 4.9, count: 157, source: 'Google', date: '2026-11' },
  list: { asOf: '2026-11', groups: [ { title: { de: 'Herren', en: 'Men' },
          items: [ { name: { de: 'Haarschnitt', en: 'Haircut' }, price: 15, note: null } ] } ] },
  facts: { walkIn: true, payment: ['cash', 'card'], transit: 'U6 Niederhofstraße', languages: ['de', 'tr'] },
  theme: { palette: 'black-gold', lettering: 'block' },
  photos: [],                          // up to 4 site-relative paths; empty in part 1
  internal: { owner: '', sources: [], notes: '' }   // never rendered
}
```

`KINDS = ['imbiss', 'restaurant', 'cafe', 'friseur', 'nails', 'handy', 'schneider', 'other']`
`RESERVED_SLUGS = ['www', 'mail', 'mail-in', 'test', 'api', 'admin', 'finden', 'v', 'cloudpit']`

- [ ] **Step 1: Write the fixtures.** `full.json` is the object above. `minimal.json` has only the five required fields (slug `minimal`, kind `other`).

- [ ] **Step 2: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateVenue, RESERVED_SLUGS } from './schema.mjs';
const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));

test('full and minimal fixtures are valid', () => {
  assert.deepEqual(validateVenue(load('full'), 'friseur-meidling'), []);
  assert.deepEqual(validateVenue(load('minimal'), 'minimal'), []);
});
test('slug must match file name', () => {
  assert.match(validateVenue(load('full'), 'other-name').join('\n'), /slug/);
});
test('bad slugs are rejected', () => {
  for (const slug of ['Friseur', 'frisör', 'a', '-x-', 'a--b', ...RESERVED_SLUGS]) {
    const errs = validateVenue({ ...load('minimal'), slug }, slug);
    assert.ok(errs.length > 0, slug);
  }
});
test('unknown status and kind are rejected', () => {
  assert.ok(validateVenue({ ...load('minimal'), status: 'live' }, 'minimal').length);
  assert.ok(validateVenue({ ...load('minimal'), kind: 'bank' }, 'minimal').length);
});
test('hours must be 7 entries of null or [open, close] within 0..1440', () => {
  assert.ok(validateVenue({ ...load('minimal'), hours: [[540, 1140]] }, 'minimal').length);
  assert.ok(validateVenue({ ...load('minimal'), hours: Array(7).fill([540, 2000]) }, 'minimal').length);
});
test('more than 4 photos, negative price, rating outside 1..5 are rejected', () => {
  const m = load('minimal');
  assert.ok(validateVenue({ ...m, photos: ['a', 'b', 'c', 'd', 'e'] }, 'minimal').length);
  assert.ok(validateVenue({ ...m, rating: { value: 6, count: 1, source: 'Google', date: '2026-11' } }, 'minimal').length);
  assert.ok(validateVenue({ ...m, list: { asOf: '2026-11', groups: [{ title: { de: 'x', en: 'x' }, items: [{ name: 'x', price: -1 }] }] } }, 'minimal').length);
});
```

- [ ] **Step 3: Run** `node --test tools/venues/` — Expected: FAIL, cannot find `./schema.mjs`.
- [ ] **Step 4: Implement `validateVenue` in `tools/venues/schema.mjs`.** Hand-written checks, no library. `name` in items may be a string or `{de, en}`; `price` is a number ≥ 0 or `null`. `theme.palette` and `theme.lettering` are checked in Task 3, not here.
- [ ] **Step 5: Run** `node --test tools/venues/` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(venues): facts schema and validation`

---

### Task 2: Opening-hours logic

**Files:**
- Create: `tools/venues/hours.mjs`, `tools/venues/hours.test.mjs`

**Interfaces:**
- Produces:
  - `openState(hours, day: 0..6, minute: 0..1439): { open: boolean, until: number|null, opensAt: { day: number, minute: number }|null }`
  - `formatMinute(minute: number): string` → `'09:00'`, `'02:00'` (wraps past 1440)
  - `viennaNow(date: Date): { day: number, minute: number }` using `Intl.DateTimeFormat` with `timeZone: 'Europe/Vienna'`
- All three must be self-contained functions (no imports, no closures) because Task 3 inlines them into the page with `fn.toString()`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openState, formatMinute, viennaNow } from './hours.mjs';
const barber = [null, [540,1140],[540,1140],[540,1140],[540,1140],[540,1140],[540,1080]];
const kebab  = [[600,120],[600,120],[600,120],[600,120],[600,120],[600,240],[600,240]];

test('open inside the range, closed outside', () => {
  assert.deepEqual(openState(barber, 1, 600), { open: true, until: 1140, opensAt: null });
  assert.equal(openState(barber, 1, 539).open, false);
  assert.equal(openState(barber, 1, 1140).open, false);
});
test('closed day points to the next opening', () => {
  assert.deepEqual(openState(barber, 0, 720), { open: false, until: null, opensAt: { day: 1, minute: 540 } });
});
test('after closing points to tomorrow, Saturday evening skips Sunday', () => {
  assert.deepEqual(openState(barber, 6, 1100).opensAt, { day: 1, minute: 540 });
});
test('past-midnight range is open after midnight on the next day', () => {
  assert.deepEqual(openState(kebab, 2, 60), { open: true, until: 120, opensAt: null });
  assert.equal(openState(kebab, 2, 121).open, false);
  assert.equal(openState(kebab, 2, 700).until, 120);
});
test('no hours at all', () => {
  assert.deepEqual(openState(undefined, 1, 600), { open: false, until: null, opensAt: null });
  assert.deepEqual(openState(Array(7).fill(null), 1, 600), { open: false, until: null, opensAt: null });
});
test('formatMinute and viennaNow', () => {
  assert.equal(formatMinute(540), '09:00');
  assert.equal(formatMinute(1560), '02:00');
  assert.deepEqual(viennaNow(new Date('2026-11-21T10:30:00Z')), { day: 6, minute: 690 }); // 11:30 CET, Saturday
  assert.deepEqual(viennaNow(new Date('2026-07-01T22:30:00Z')), { day: 4, minute: 30 });  // 00:30 CEST, Thursday
});
```

- [ ] **Step 2: Run** `node --test tools/venues/` — Expected: FAIL, cannot find `./hours.mjs`.
- [ ] **Step 3: Implement the three functions in `tools/venues/hours.mjs`.** For `openState`, check today's range first, then yesterday's range if it runs past midnight (`close <= open`).
- [ ] **Step 4: Run** `node --test tools/venues/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(venues): opening-hours logic incl. past midnight`

---

### Task 3: Page template

**Files:**
- Create: `tools/venues/i18n.mjs`, `tools/venues/themes.mjs`, `tools/venues/template.mjs`, `tools/venues/template.test.mjs`
- Create: `v/_shared/fonts/` (copy the four woff2 files from `demo/oencu-doener/fonts/`)

**Interfaces:**
- Consumes: `validateVenue`, `KINDS` (Task 1); `openState`, `formatMinute`, `viennaNow` (Task 2).
- Produces:
  - `T: { de: {...}, en: {...} }` and `listTitle(kind, lang): string` from `i18n.mjs`. Titles: imbiss/restaurant/cafe → `Speisekarte` / `Menu`; friseur/nails/schneider/other → `Preise` / `Prices`; handy → `Reparatur & Preise` / `Repairs & prices`.
  - `PALETTES`, `LETTERINGS` (objects keyed by name) from `themes.mjs`. Start with palettes `black-gold`, `white-black`, `red-yellow`, `cream-green`, `blue-white`; letterings `block` (Anton), `narrow` (Archivo Narrow), `serif` (system serif stack). Default when `theme` is missing: `white-black` + `block`.
  - `renderVenue(venue: object): string` from `template.mjs` — a complete HTML document. Throws if `theme.palette` or `theme.lettering` is unknown.
  - `esc(text: string): string` exported from `template.mjs`.

Page structure, top to bottom (each block only if its data exists):

1. Sign: `area` line, `name` as `<h1>` in the venue's lettering and palette.
2. Status line `[data-status]`: build-time text is today's hours in German; inline JS replaces it with `Jetzt geöffnet · bis 19:00` / `Geschlossen · öffnet Mo 09:00` (EN: `Open now · until 19:00` / `Closed · opens Mon 09:00`). Append ` · ohne Termin` / ` · walk-in` when `facts.walkIn` is true.
3. Actions: `Anrufen` (`tel:`), `Route` (Google Maps directions link built from the address), `Chat öffnen` (see owner mode below).
4. Price board `#liste`: heading from `listTitle`, groups, rows `name … price €`, `Stand: MM/YYYY`. Prices formatted `15` or `9,90`.
5. Facts strip: walk-in, payment, transit, languages.
6. Rating as plain text: `4,9 von 5 · 157 Bewertungen auf Google · Stand 11/2026`.
7. Photo slots: `<div class="photos" data-photos>` rendering `venue.photos` (0–4 `<img>` with `loading="lazy"`); absent when empty.
8. Hours table (current day marked by JS) and address.
9. Footer: the unconfirmed line (hidden status only), imprint and privacy links.

Owner mode: the element `<section class="owner" data-owner hidden>` contains the headline `Das ist Ihre Seite` / `This is your page`, the large line `Schreiben Sie in Ihrer Sprache — Deutsch, Türkçe, العربية, فارسی, English …` and the button `Chat öffnen`. Inline JS un-hides it when the URL has a `k` query parameter. In part 1 the button's `href` is `https://wa.me/4367764292055`; it carries `data-chat-hook` so part 2 can replace the behaviour. The owner key itself is never written into the HTML.

All CSS and JS are inlined in the document. Fonts load from `https://www.namax.at/v/_shared/fonts/`. Head for `hidden`: robots noindex. Head for `public`: `<link rel="canonical" href="https://<slug>.namax.at/">`, no robots tag. Always: `<html lang="de">`, viewport meta, `<title>` = `name — area`, description built from name, kind and street.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderVenue, esc } from './template.mjs';
const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('full venue renders every block', () => {
  const html = renderVenue(load('full'));
  for (const s of ['<h1', 'Friseur Meidling', 'Haarschnitt', '15', 'Stand: 11/2026', '4,9', '157', 'tel:+436604130063', 'data-status', 'data-owner', 'data-chat-hook'])
    assert.ok(html.includes(s), s);
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
  const pub = renderVenue({ ...load('full'), status: 'public' });
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
```

- [ ] **Step 2: Run** `node --test tools/venues/` — Expected: FAIL, cannot find `./template.mjs`.
- [ ] **Step 3: Implement `i18n.mjs`, `themes.mjs`, `template.mjs`.** Build the document with template literals; pass every venue string through `esc`. Language data goes into the page as one JSON object in `<script type="application/json">` (escape `<` as `<`), read by the inline script, which sets `textContent` of `[data-i18n]` elements. Inline the Task 2 functions with `fn.toString()`. Reuse the toggle and status approach from `demo/oencu-doener/index.html` (read it first), with `localStorage` key `namax-venue-lang`.
- [ ] **Step 4: Run** `node --test tools/venues/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(venues): page template, themes and languages`

---

### Task 4: Build command

**Files:**
- Create: `tools/build-venues.mjs`, `tools/venues/build.test.mjs`
- Modify: `.vercelignore` (add a line `venues`)

**Interfaces:**
- Consumes: `validateVenue` (Task 1), `renderVenue` (Task 3).
- Produces: `buildVenues({ srcDir: string, outDir: string }): { built: string[], removed: string[], errors: string[] }` exported from `tools/build-venues.mjs`; when the file is run directly it uses `venues/` and `v/`, prints one line per venue (`hidden  friseur-meidling`), prints errors, and exits 1 if there are any errors. Nothing is written when there are errors.

Rules: every `*.json` in `srcDir` whose name does not start with `_` is a venue. `hidden` and `public` write `outDir/<slug>/index.html`. `removed` deletes `outDir/<slug>/`. Any directory in `outDir` that is not `_shared` and has no matching non-removed venue is deleted. Invalid JSON is reported as an error naming the file.

- [ ] **Step 1: Write the failing tests** (each test uses `mkdtempSync` under `os.tmpdir()` for both dirs and copies fixtures in)

```js
test('builds hidden and public venues, lists them', ...)        // built = ['friseur-meidling', 'minimal']; both index.html exist
test('removed status deletes an existing output dir', ...)      // build once, set status 'removed', build again → dir gone, removed = [slug]
test('deleting the facts file deletes the output dir', ...)
test('_shared is never deleted', ...)                           // create outDir/_shared/x → still there
test('one invalid venue blocks the whole build and writes nothing', ...)
                                                                // errors.length === 1, error text contains the file name, outDir has no new dirs
test('broken JSON is reported with the file name', ...)
test('files starting with _ are ignored', ...)
```

Write each test body with the assertions stated in its comment.

- [ ] **Step 2: Run** `node --test tools/venues/` — Expected: FAIL, `buildVenues` is not exported.
- [ ] **Step 3: Implement `buildVenues` and the CLI entry** (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`).
- [ ] **Step 4: Run** `node --test tools/venues/` — Expected: PASS.
- [ ] **Step 5: Add `venues` to `.vercelignore`.** Run `node tools/build-venues.mjs` with an empty `venues/` folder — Expected: exit 0, no output dirs besides `v/_shared`.
- [ ] **Step 6: Commit** `feat(venues): build command`

---

### Task 5: Local preview by subdomain, and the look of the page

**Files:**
- Modify: `tools/serve.mjs`
- Modify: `tools/venues/template.mjs`, `tools/venues/themes.mjs` (styling only)
- Create: `venues/_beispiel-friseur.json`, `venues/_beispiel-imbiss.json`, `venues/_beispiel-handy.json` (underscore = not built by default)

**Interfaces:**
- Consumes: everything above.
- Produces: `tools/serve.mjs` serves `/v/<slug>/…` when the request host is `<slug>.localhost`; requests for `/v/_shared/…` are served from any host with `Access-Control-Allow-Origin: *`.

- [ ] **Step 1: Extend `tools/serve.mjs`.** Read `req.headers.host`; if it matches `^([a-z0-9-]+)\.localhost(:\d+)?$` and the first group is not `www`, prefix the pathname with `/v/<slug>`.
- [ ] **Step 2: Write three example venues** using facts already collected in `docs/leads/1120-meidling.md` (Friseur Meidling for `friseur`) and `demo/oencu-doener/index.html` (Öncü for `imbiss`, prices only, no photos); the `handy` one uses clearly fictional data named `Beispiel Handy Shop`. Build them into a scratch folder: `node -e "import('./tools/build-venues.mjs').then(m=>console.log(m.buildVenues({srcDir:'venues-preview',outDir:'v'})))"` after copying the three files without the underscore into `venues-preview/`. Delete `venues-preview/` and the three output dirs when the task is done.
- [ ] **Step 3: Design pass.** Start the preview (`preview_start` with name `namax`), open `http://beispiel-friseur.localhost:4173/` at 375×812 and at desktop width. Work on the CSS until all of these hold, checking each with the browser tools:
  - no horizontal scroll at 375 px (`document.documentElement.scrollWidth <= 375`);
  - the name, the status line and the three action buttons are visible without scrolling at 375×812;
  - a 40-character name wraps and does not overflow;
  - price rows keep name and price on one line where they fit and wrap the name, never the price;
  - each of the five palettes passes WCAG AA contrast for body text (≥ 4.5:1);
  - tap targets are at least 44 px high;
  - the page looks finished with zero photos, and with the minimal fixture;
  - no dark full-screen hero, no gradient, no card grid, no icon row above the fold.
- [ ] **Step 4: Run** `node --test tools/venues/` — Expected: PASS (styling must not break Task 3 tests).
- [ ] **Step 5: Show Nasim.** Take screenshots at 375 px of the three examples in two palettes each and send them with `SendUserFile`. Stop and wait for his corrections; apply them and repeat Steps 3–5 until he approves the look.
- [ ] **Step 6: Commit** `feat(venues): subdomain preview and page styling`

---

### Task 6: Routing on Vercel

**Files:**
- Modify: `vercel.json`
- Create: `docs/venues-deploy-check.md`

**Interfaces:**
- Consumes: output layout `v/<slug>/index.html`, `v/_shared/fonts/*`.
- Produces: production routing. Nothing in this task is deployed.

- [ ] **Step 1: Add to `vercel.json`**

```json
"rewrites": [
  { "source": "/v/_shared/:path*", "destination": "/v/_shared/:path*" },
  { "source": "/:path*",
    "has": [{ "type": "host", "value": "(?<slug>(?!www\\.)[a-z0-9-]+)\\.namax\\.at" }],
    "destination": "/v/:slug/:path*" }
]
```

and to `redirects`:

```json
{ "source": "/v/:slug((?!_shared)[a-z0-9-]+)",
  "has": [{ "type": "host", "value": "(www\\.)?namax\\.at" }],
  "destination": "https://:slug.namax.at/", "permanent": false }
```

and to `headers`:

```json
{ "source": "/v/_shared/(.*)", "headers": [
  { "key": "Access-Control-Allow-Origin", "value": "*" },
  { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] },
{ "source": "/v/(.*)", "headers": [ { "key": "X-Robots-Tag", "value": "noindex" } ] }
```

The last header covers the `www.namax.at/v/...` path only; it must not apply on venue hosts. If Vercel applies it to rewritten requests too (check in Step 3), remove it and rely on the redirect.

- [ ] **Step 2: Validate the JSON.** Run `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('ok')"` — Expected: `ok`. Run `node tools/check.mjs` — Expected: exit 0 (existing site rules still hold).
- [ ] **Step 3: Write `docs/venues-deploy-check.md`**: the checks to run after Nasim's first batch deploy, each with the exact command and expected result:
  - `curl -sI https://<slug>.namax.at/` → `200`, no `x-robots-tag` for a public venue;
  - `curl -s https://<slug>.namax.at/ | grep -c noindex` → `1` for hidden, `0` for public;
  - `curl -sI https://www.namax.at/v/<slug>` → `307` to `https://<slug>.namax.at/`;
  - `curl -sI https://<slug>.namax.at/v/_shared/fonts/anton-latin.woff2` → `200` with `access-control-allow-origin: *`;
  - `curl -sI https://unknown-slug.namax.at/` → `404`;
  - `curl -sI https://www.namax.at/` → `200` (main site unaffected);
  - if the named-group host rule does not work, the fallback: have `tools/build-venues.mjs` write one explicit rewrite per slug into `vercel.json`.
- [ ] **Step 4: Commit** `feat(venues): host routing for venue pages`

---

## After this plan

Part 1 is done when `node --test tools/venues/` passes, Nasim has approved the look, and `docs/venues-deploy-check.md` exists. Then: write the facts files for the first street batch (about 15 venues), and write the plan for part 2 (assistant).
