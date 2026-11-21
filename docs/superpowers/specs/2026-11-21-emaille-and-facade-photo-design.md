# Emaille look and facade photo for venue pages

Date: 2026-11-21 · Agreed with Nasim in chat (he chose direction A from three style samples, then "ok" to this package).

## Why

The free venue page at `<slug>.namax.at` is the hook. Nasim shows it to the owner on his phone; the owner should think "I want a site like this", and then Nasim offers the paid step: an own site, in the owner's style, on the owner's domain. Nasim's verdict on the current look: plain, templated, ugly body text, "built by a schoolboy". 68 of 199 live pages have only name, kind, area and address, so the look must carry a page with no material at all.

## Goals

- Every venue page looks respectable and specifically Viennese in the first three seconds on a phone, also with no photo and no hours.
- One brand display face and one brand text face on all venue pages (no system font for body text).
- Nasim can add a photo of the venue's front from his private list on the spot: take it or pick it from the gallery, crop it in a frame of the exact page shape, upload; the page shows it.

## Non-goals

- No new layouts per kind; one look for all pages, colors per kind.
- No automatic face or plate blurring. Nasim frames shots without people and checks before upload.
- The facade photo in the WhatsApp/Instagram preview picture: a later small step, not in this package.
- No change to the owner chat, the owner's own 4 photos, the admin list's other functions, or the desktop two-column layout logic.

## Anti-goals (fails even if it technically works)

- Slow on a cheap phone with mobile data (heavy video backgrounds, big unoptimised images, many font files).
- Flashy or cheap: blinking, bouncing, neon. The direction is calm and solid.
- Long venue names breaking mid-word or overflowing the plate (this regressed before).
- Content invisible when animations don't run (reduced motion, background tab, screenshot crawlers).
- Any cost beyond the domain for free pages.

## Constraints

- Fonts self-hosted under `/v/_shared/fonts/` (woff2, latin + latin-ext subsets via unicode-range, `font-display:swap`), as today. No Google Fonts on venue pages.
- The OG preview picture (satori) must use the same faces; satori needs .woff, kept in `api/_lib/venues/og-fonts/`. Turkish letters (Ş, ğ) must keep rendering (latin-ext fallback family, pinned by an existing test).
- DE and EN switching keeps working for every new text (`data-de`/`data-en`).
- `prefers-reduced-motion`: no animation, final state shown.
- Facade photo storage: Vercel Blob, one file per venue, about 250 KB after on-phone resize; replaced file deleted; deleted with the page on removal.
- Owner keys, admin key, phone number rules unchanged (see project memory).

## Approaches considered

1. **Replace the look of all pages with Emaille** (chosen). One enamel street-sign plate for every page, color per kind; brand faces everywhere; OG picture redrawn in the same style. Every current and future page improves at once.
2. Add Emaille as one more theme next to the current ones. Less risk, but half the pages keep the old look; works against the goal.
3. Rewrite the page from scratch. Loses tuned behaviour (long-name fitting, languages, desktop layout, owner chat) for no gain the look needs.

## Design (what Nasim decided, and calls marked as mine)

### Look (direction A, "Wiener Emaille")

The sample Nasim chose is kept next to this document: `2026-11-21-emaille-sample.html`, option A (classes `.a …`). It is the reference for faces, plate, rim, screws, grain, gleam and swing.

- The sign is a Viennese enamel street-sign plate: rounded plate in the venue's enamel color, inset rim in the ink color, two small screw dots at the sides, soft shadow. Inside: kind line (small caps, tracked), venue name (brand display face, uppercase, condensed), district line "12., MEIDLING" (my call: Vienna's own district notation; EN keeps the same, district numbers are not translated).
- Page background: the page color with a faint dot grain (CSS radial gradient, no image).
- Brand display face: Barlow Condensed 600/700 (as in the sample). Brand text face: Figtree 400/600/700. Used for every heading, button and body text.
- Load animation, once per page view: the plate drops in with a short swing (about 1.4 s), then a light gleam sweeps across the enamel; the rest of the page fades up. Starts from a visible state where possible; with reduced motion nothing moves.
- Colors per kind (my call, keeps today's palette mapping in `tools/city/build-dataset.mjs` and today's palette names in data, so stored venues stay valid; only the palette values and how they are drawn change):
  - imbiss red-yellow → red enamel, white rim and text
  - restaurant cream-green → deep green enamel, cream rim and text
  - cafe black-gold → black enamel, gold rim and text
  - friseur black-white → black enamel, white rim and text
  - nails / kosmetik white-black → white enamel, black rim and text
  - handy blue-white → Vienna blue enamel, white rim and text
  - schneider cream-green → as restaurant
- The `lettering` field stays valid in data but no longer changes the face (one brand face for all, Nasim asked for "our own font everywhere").
- Long names: the existing fit logic (`titleSize`, container query units, `lang="de"`) stays and is re-tuned for Barlow Condensed's narrower width; the test set includes "Änderungsschneiderei Fa. Orhan Yigitsoy" at 360 px in DE and EN.
- The OG picture is redrawn as the same enamel plate (Barlow Condensed + Figtree); its URL version changes so cached old pictures are not served.

### Facade photo

- Database (my call): `alter table venues add column if not exists facade_url text;` is appended to `schema.sql` and applied to production Neon before the deploy (the same way `owner_key_enc` was added), so new code never meets a missing column.
- Desktop (my call): the photo sits at the top of the main column; the sticky side card is unchanged.
- Shown directly under the plate, before the Route button, as a 4:3 picture with rounded corners, full content width, `width`/`height` set to avoid layout jump. No photo: nothing there, the page looks complete without it.
- Stored as a column on the venue (my call: `venues.facade_url text`, store methods `setFacade(slug, url|null)`), separate from the owner's photos and not counted in their limit of 4.
- Admin list: each card gets a "Foto" button (and a small thumbnail plus "Foto löschen" when one exists).
  - The button opens the phone's chooser (`<input type="file" accept="image/*">` without `capture`): on iPhone "Take Photo" or "Photo Library".
  - A full-screen crop step shows the image under a fixed 4:3 frame; drag to move, pinch or slider to zoom; "Verwenden" and "Neu wählen".
  - The phone draws the cropped area to a canvas at 1600×1200 and encodes JPEG (quality about 0.82), so about 250 KB goes up.
  - POST to `/liste` with the admin key and slug; the server checks the admin key, size limit and image bytes (same sniffing as owner photos), stores to Blob at `venues/<slug>/facade-<random>.jpg`, sets the column, deletes the previous file.
  - "Foto löschen" removes column and file.
  - After upload the "Seite" link opens the page with a cache-busting query so the new photo shows at once (the public page is cached for 60 s).
- Page removal by the owner deletes the facade file too (with the owner photos).
- All new admin texts in German, like the rest of the list.

## Left to the builder

- Exact enamel color values, rim width, shadow, grain density, animation curves, within the sample's character.
- Crop UI details (gesture code, slider vs pinch only), as long as it works on iPhone Safari and Android Chrome.
- How the font files are obtained (npm @fontsource packages copied into the repo is fine).

## Done when

- Tests cover: plate markup and faces on a minimal venue; reduced-motion rule present; long name fit; OG renders with new faces and Turkish letters; facade upload/replace/delete/purge on removal; admin endpoint refuses without key; crop output size.
- Screenshots at phone size shown to Nasim: short name, long name, page with hours, page without data, page with facade photo, the list card with Foto button and crop step.
- Deployed only after Nasim's "yes"; after deploy all live pages return 200 and the list works.
