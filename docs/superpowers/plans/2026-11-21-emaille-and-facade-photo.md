# Emaille Look and Facade Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every venue page gets the Viennese enamel-sign look with one brand font pair, and Nasim can put a cropped facade photo on a page from his private list.

**Architecture:** One template (`template.mjs`) draws all pages; the plate, faces and colors change there and in `themes.mjs`, the OG picture follows in `og.mjs`. The facade photo is one column on `venues`, written by a new admin POST on `/liste` (multipart), shown under the plate, purged with the page.

**Tech Stack:** Node 25 ESM, node:test, PGlite (tests) / Neon (prod), Vercel functions + Blob, satori + resvg, plain browser JS.

**Spec:** `docs/superpowers/specs/2026-11-21-emaille-and-facade-photo-design.md` (reference sample: `docs/superpowers/specs/2026-11-21-emaille-sample.html`, option A).

## Global Constraints

- Brand faces: Barlow Condensed 600/700 (display), Figtree 400/600/700 (text); self-hosted woff2 under `/v/_shared/fonts/`, latin + latin-ext via unicode-range, `font-display:swap`; .woff copies in `api/_lib/venues/og-fonts/` for satori.
- Palette names in data stay (`black-gold`, `black-white`, `white-black`, `red-yellow`, `cream-green`, `blue-white`); `lettering` stays valid but no longer changes the face.
- `prefers-reduced-motion: reduce` → no animation; content visible at rest without animation.
- DE/EN: every new visible text uses `tr()` / `data-de`/`data-en`.
- Facade: Blob path `venues/<slug>/facade-<32 hex>.jpg`, JPEG/PNG/WebP sniffed, max 3 MB, previous file deleted, purged on removal.
- Admin texts in German. Admin endpoint returns 404 without a valid admin key.
- Tests: `npm test` must stay green (217 now).

## Review Focus

- Long names (e.g. "Änderungsschneiderei Fa. Orhan Yigitsoy", "Buschenschank Familie Szüts & Weinbau Suchel") at 360 px must not overflow the plate or break mid-word, DE and EN.
- Turkish/Balkan letters (Ş ğ ı č ć ž đ) render in page and OG picture (fallback face).
- Upload with a wrong/old admin key, a non-image, or a removed venue → refused, no Blob write.
- Replacing the facade twice leaves exactly one file (old ones deleted).
- Owner removal of a page with a facade deletes its file.

---

### Task 1: Brand fonts and enamel palettes

**Files:**
- Create: `v/_shared/fonts/barlow-condensed-{latin,latin-ext}-{600,700}.woff2`, `v/_shared/fonts/figtree-{latin,latin-ext}-{400,600,700}.woff2`, `api/_lib/venues/og-fonts/barlow-condensed-{latin,latin-ext}-700-normal.woff`, `api/_lib/venues/og-fonts/figtree-{latin,latin-ext}-{600}-normal.woff`
- Modify: `api/_lib/venues/themes.mjs`, `package.json` (devDependencies @fontsource/barlow-condensed@5.3.0, @fontsource/figtree@5.3.0)
- Test: `api/_lib/venues/template.test.mjs`

**Interfaces:**
- Produces: `BRAND = { display, text, faces }` exported from `themes.mjs` (`display`/`text` are CSS font-family stacks starting with `NamaxDisplay` / `NamaxText`; `faces` is the @font-face CSS for both). `PALETTES[name]` keeps its keys (`signBg, signInk, pageBg, ink, accent, accentInk, boardBg, boardInk`) with enamel values.

- [ ] Write test `brand faces are declared and used for headings and body` asserting the rendered page CSS contains `font-family:NamaxDisplay`, `font-family:NamaxText`, `barlow-condensed-latin-700.woff2`, `figtree-latin-400.woff2`, and that `body{` uses `var(--body)` whose value starts with `NamaxText`.
- [ ] Run `node --test api/_lib/venues/template.test.mjs` → FAIL.
- [ ] Install font packages, copy the files listed above, add `BRAND` to `themes.mjs`, set enamel palette values.
- [ ] Run test → PASS; `npm test` green. Commit `feat(venues): brand fonts and enamel palettes`.

### Task 2: The enamel plate in the template

**Files:**
- Modify: `api/_lib/venues/template.mjs` (`css()`, `sign()`, `titleSize()`, `head()` faces), `api/_lib/venues/i18n.mjs` only if a new label is needed
- Test: `api/_lib/venues/template.test.mjs`

**Interfaces:**
- Consumes: `BRAND`, `PALETTES` (Task 1).
- Produces: `districtLine(v) → string` ("12., MEIDLING" for city Wien and zip 1010–1230; otherwise area upper-cased) exported for tests.

- [ ] Tests:
  - `the sign is an enamel plate`: markup has `class="plate"`, `class="rim"`, two `class="screw"`, `class="gleam"`, kind line `data-de="Handyshop"`/`data-en="Phone shop"`, name in `<h1 lang="de"`, district line `12., MEIDLING`.
  - `districtLine`: `{zip:'1120',city:'Wien',area:'Meidling'}` → `12., MEIDLING`; `{zip:'1010',city:'Wien',area:'Innere Stadt'}` → `1., INNERE STADT`; non-Vienna → area only.
  - `motion respects reduced-motion and content is visible at rest`: CSS contains `@media (prefers-reduced-motion:reduce)` and no rule leaves `.plate` or main content at `opacity:0` outside a keyframe.
  - Existing long-name tests keep passing (retuned `titleSize` for Barlow width).
- [ ] Run → FAIL. Implement per sample option A (swing 1.4 s, gleam after 1.1 s, body fade-up), dot grain background from `pageBg`, Figtree body, Barlow headings, buttons with radius 12px.
- [ ] `npm test` green. Screens at 360 px (short name, long name, with hours, without data) via preview server. Commit `feat(venues): Viennese enamel plate on every page`.

### Task 3: OG picture in the new look

**Files:**
- Modify: `api/_lib/venues/og.mjs`, `api/_lib/venues/og-url.mjs` (version salt `'emaille1'` in the hashed fields)
- Test: `api/_lib/venues/og.test.mjs`

- [ ] Tests: existing six stay green; new `the picture is an enamel plate in the brand faces` asserts the tree uses families `Display, DisplayExt` and `Text, TextExt`, has a rim border in `signInk`, and `ogVersion` differs from the pre-change value for the same venue.
- [ ] Run → FAIL; implement (plate with rim on page background, kind line + name + district line); Turkish-letter test still passes.
- [ ] `npm test` green. Commit `feat(venues): preview picture as an enamel plate`.

### Task 4: Facade photo — storage, endpoint, page, purge

**Files:**
- Modify: `api/_lib/venues/schema.sql` (append `alter table venues add column if not exists facade_url text;`), `store.mjs`, `pg-store.mjs` (`setFacade(slug, url|null)`, `getVenue` returns `facadeUrl`, `listForAdmin` returns `facadeUrl`), `merge.mjs` (`venue.facade = record.facadeUrl` when set), `template.mjs` (`facade(v)` under the plate / top of main column), `http.mjs` (`handleAdminFacade`, purge in `handleChat`), `api/venue/admin.js` (POST dispatch by content type), `tools/serve.mjs` (dispatch locally)
- Test: `store.test.mjs`, `http.test.mjs` or `admin.test.mjs`, `template.test.mjs`

**Interfaces:**
- Produces: `handleAdminFacade(req, { store, blob, adminKeyHash }) → Response` — multipart fields `k`, `slug`, `photo` (upload) or `delete=1` (remove); 200 `{ url|null }`; 404 bad key / unknown / removed; 413 / 415 like owner photos.
- Produces: `MAX_FACADE_BYTES = 3 * 1024 * 1024`.

- [ ] Tests:
  - store contract: `setFacade` then `getVenue(slug).facadeUrl` and `listForAdmin()[i].facadeUrl`; `setFacade(slug, null)` clears.
  - endpoint: upload stores `venues/<slug>/facade-*.jpg` and returns its url; second upload deletes the first url via `blob.del`; `delete=1` clears and deletes; no key / wrong key / removed venue → 404 and no `blob.put`; text file → 415.
  - removal through chat chips `delete` → `delete_yes` deletes the facade file.
  - template: venue with `facade` renders `<figure class="facade"><img … width="1600" height="1200"`; without it no `facade` element.
- [ ] Run → FAIL; implement; `npm test` green. Commit `feat(venues): facade photo stored, shown and purged`.

### Task 5: "Foto" in the private list (choose, crop, upload)

**Files:**
- Modify: `api/_lib/venues/admin.mjs` (row field `facadeUrl`; buttons `Foto`, thumbnail, `Foto löschen`; crop overlay; upload script), `http.mjs` `handleAdmin` (pass `facadeUrl`)
- Test: `admin.test.mjs`

- [ ] Tests: card renders `data-facade="<slug>"` button "Foto"; with `facadeUrl` renders thumbnail `<img` of it and "Foto löschen"; page has `<input type="file" accept="image/*"` without `capture`; crop output constants `1600` and `1200` and JPEG quality `0.82` present; all scripts closed and parse (existing test).
- [ ] Run → FAIL; implement crop overlay: fixed 4:3 frame, drag to move, pinch and range slider to zoom, "Verwenden" / "Neu wählen" / "Abbrechen"; canvas 1600×1200 → `toBlob('image/jpeg', 0.82)` → POST multipart; on success update thumbnail and set the card's "Seite" link to `?f=<timestamp>`.
- [ ] `npm test` green; try the flow in the preview server at phone size with a sample image. Commit `feat(venues): add a cropped facade photo from the private list`.

### Task 6: Show, then deploy on "yes"

- [ ] Screenshots at phone size: short name, long name, with hours, without data, with facade, list card with Foto, crop step. Send to Nasim.
- [ ] On his "yes": apply the `facade_url` column to production Neon (node + `@neondatabase/serverless`, DATABASE_URL from `.env.local`, statement `alter table venues add column if not exists facade_url text`), then fast-forward main and push.
- [ ] Verify live: all 199 pages 200 with `class="plate"`, list 200 with key and 404 without, OG picture 200 for one venue.
