# Owner Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners leave a quiet request from their page; requests land in Nasim's private list (remembered login), he calls the business back. The owner chat is switched off.

**Architecture:** A new `venue_requests` table behind the existing store interface (memory + Postgres, one shared contract test). A public `POST /api/venue/claim` writes requests; the private list's start page shows them. A switch in `services.mjs` turns the owner chat off (keyed pages fall back to `ownerBar()`).

**Tech Stack:** Node ESM on Vercel functions, Neon Postgres (PGlite in tests), node:test.

**Spec:** `docs/superpowers/specs/2026-11-22-owner-requests-design.md`

## Global Constraints

- Owner keys never appear in public HTML; the admin key is never printed or committed (only `.env.local` and Vercel env).
- Everything Nasim sees in the list is German; owner-facing page text is DE + EN through `tr()` / `ui()`.
- Every value from a request (name, phone, text) is escaped with `esc()` wherever it is rendered.
- No production DB write (schema migration) and no push to main without Nasim's explicit "да".
- Tests: `npm test` must stay green.

## Review Focus

1. A bot posting the claim form in a loop → at most 3 requests per venue per Vienna day; honeypot filled → 200, nothing stored.
2. `<script>` in name or text → rendered escaped in the list; phone with letters or under 6 digits → 400.
3. A request for a venue later removed → still listed with the venue's name (join on `venues`, which keeps removed rows).
4. Old bookmarks `/liste?k=…` → still work (and set the cookie); the list's buttons (rotate, facade, show/hide, done) work with the cookie alone.
5. An owner opening an old `?k=` link after the switch → sees the WhatsApp bar, no chat, and `/api/venue/chat` → 404.

---

### Task 1: Requests in the store

**Files:** Modify `api/_lib/venues/schema.sql` (append table), `store.mjs`, `pg-store.mjs`; Test `store.test.mjs` (inside `storeContract`), add `venue_requests` to the truncate list in `pg-store.test.mjs`.

**Produces:**
- `addRequest(slug, { name = '', phone = '', text = '' }) → id`
- `listRequests() → [{ id, slug, venueName, name, phone, text, at, doneAt|null }]`, open first, then newest; `venueName` from `venues.facts->>'name'`
- `setRequestDone(id, done: boolean)`
- `countRequestsSince(slug, sinceIso) → number`
- `purgeRequests(nowIso)`: deletes done with `done_at` < now − 90 days and open with `at` < now − 180 days

Table: `venue_requests (id bigserial primary key, slug text not null references venues(slug) on delete cascade, name text not null default '', phone text not null default '', text text not null default '', at timestamptz not null default now(), done_at timestamptz)`, index on `(done_at, at)`.

- [ ] Step 1: tests `requests: add, list open first then newest, mark done and back`, `requests: count per venue since a time`, `requests: purge (far-future nowIso removes all; now keeps all)`, `requests: a removed venue's request keeps the venue name`.
- [ ] Step 2: run → fail. Step 3: implement both stores + schema. Step 4: `node --test api/_lib/venues/store.test.mjs api/_lib/venues/pg-store.test.mjs` → pass.
- [ ] Step 5: commit `feat(venues): owner requests in the store`.

### Task 2: Claim endpoint

**Files:** Modify `api/_lib/venues/http.mjs` (`handleClaim`); Create `api/venue/claim.js` (POST only, like `chat.js`); Test `http.test.mjs`.

**Produces:** `handleClaim(req, { store, now })`: JSON `{ slug, name, phone, text, website }` (`website` = honeypot) → `200 {ok:true}`; 404 unknown/removed venue; 400 missing name, name > 80, text > 500, phone not matching `/^\+?[0-9 ()\/-]{6,20}$/` or < 6 digits; 429 when `countRequestsSince(slug, viennaDayStart(now()))` ≥ 3; honeypot non-empty → 200, nothing stored.

- [ ] Step 1: tests `claim: stores a request`, `claim: honeypot`, `claim: bad phone / long text → 400`, `claim: 4th request in a day → 429`, `claim: removed venue → 404`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): owners can leave a request from the page`.

### Task 3: Owner chat off

**Files:** Modify `api/_lib/venues/services.mjs` (`OWNER_CHAT = false` → no `ownerPart`), `api/venue/chat.js` (404 while off); Test `page.test.mjs` / `http.test.mjs`.

- [ ] Step 1: tests `keyed page shows the WhatsApp bar, not the chat, while the chat is off`, `chat endpoint → 404 while off`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): owner chat switched off for now`.

### Task 4: "Sind Sie der Inhaber?" on the page

**Files:** Modify `template.mjs` (footer + `<dialog>`, CSS, small inline script), `i18n.mjs`; Test `merge.test.mjs` (footer tests live there).

Footer, only when `v.confirmed !== true` and not the owner view: `Angaben nicht vom Inhaber bestätigt · <button class="claim">Sind Sie der Inhaber?</button>` (EN "Are you the owner?"). Dialog: heading "Kostenlos verwalten", inputs name, "Ihre Telefonnummer" (`type=tel`), optional message, hidden honeypot `website`, line "Wir rufen Sie kurz an – über die Telefonnummer des Geschäfts." (EN "We call you back on the business's phone number."), link `https://www.namax.at/datenschutz#inhaber`, button "Anfrage senden"; success "Danke! Wir melden uns, meist innerhalb eines Tages." Script posts JSON to relative `/api/venue/claim`.

- [ ] Step 1: tests `footer: unconfirmed page offers "Sind Sie der Inhaber?" and a form posting to /api/venue/claim`, `footer: confirmed page has no owner link`, `claim dialog has a hidden honeypot and a privacy link`, page scripts still parse.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): quiet owner link in the page footer`.

### Task 5: Requests and remembered login in the private list

**Files:** Modify `http.mjs` (`handleAdmin`, `handleAdminRotate`, `handleAdminFacade`, done action), `admin.mjs` (`renderChooser` gets `requests`; client JS stops reading `k` from the URL); Test `admin.test.mjs`.

Admin key: `?k=` first, else cookie `namax_admin`. GET with valid `?k=` → `303` to the same URL without `k`, `Set-Cookie: namax_admin=<key>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`. POST `{ requestId, done }` → `setRequestDone` → `200 {done}`. `handleAdmin` calls `purgeRequests(now)`, loads each request's venue via `store.getVenue(slug)`.

Card: venue name linking to its page, time (Vienna), name, typed phone (`tel:`), text; business numbers (normalized `facts.phone` and `facts.internal.overture.match.phone`, deduplicated) each as "Geschäft anrufen" `tel:` button, with "gleiche Nummer" when equal to the typed phone; none → "Kein Telefon – persönlich vorbeigehen"; "Erledigt" / "Wieder offen"; done ones under "Erledigt (n)".

- [ ] Step 1: tests `login: ?k= sets the cookie and redirects without the key`, `cookie alone opens the list; wrong cookie → 404`, `start page shows open requests first with count, escaped`, `business number shown, "gleiche Nummer" when equal; no number → persönlich`, `POST requestId done → marked; without admin → 404`, `rotate and status still work with the cookie only`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): requests and remembered login in the private list`.

### Task 6: Privacy text, migration, deploy

**Files:** `datenschutz.html`, `en/datenschutz.html` (section `id="inhaber"`: name, phone, message stored to answer the request; deleted 90 days after handled, at the latest after 180 days; Art. 6(1)(b)/(f) DSGVO).

- [ ] Step 1: write both sections; `npm test` → green; commit `docs(privacy): owner request form`.
- [ ] Step 2: show Nasim; after his "да": apply the `venue_requests` table to production (one-off script with DATABASE_URL), push venue-conveyor to main.
- [ ] Step 3: verify live: request on a hidden venue lands in the list, mark done; `/liste?k=` redirects to `/liste`; old owner link shows the WhatsApp bar; `/datenschutz#inhaber` reachable.
