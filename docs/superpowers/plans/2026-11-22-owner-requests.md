# Owner Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners can ask for access from their page quietly; access requests, chat handoffs and removals land as requests in Nasim's private list, which he opens with a remembered login.

**Architecture:** A new `venue_requests` table behind the existing store interface (memory + Postgres, one shared contract test). A public `POST /api/venue/claim` and the chat's existing handoff/removal effects write requests. The private list's start page shows them; a cookie replaces the key in the URL.

**Tech Stack:** Node ESM on Vercel functions, Neon Postgres (PGlite in tests), node:test.

**Spec:** `docs/superpowers/specs/2026-11-22-owner-requests-design.md`

## Global Constraints

- Owner keys never appear in public HTML; the admin key is never printed or committed (only `.env.local` and Vercel env).
- Everything Nasim sees in the list is German; owner-facing page text is DE + EN through `tr()` / `ui()`.
- Every value from a request (name, phone, text) is escaped with `esc()` wherever it is rendered.
- No production DB write (schema migration) and no push to main without Nasim's explicit "да".
- Tests: `npm test` must stay green (254+ tests).

## Review Focus

1. A bot posting the claim form in a loop → at most 3 requests per venue per Vienna day, honeypot filled → 200 but nothing stored.
2. `<script>` in name or text → rendered escaped in the list; phone with letters or under 6 digits → 400.
3. A request for a venue that the owner later removed via the chat → still listed with the venue's name (join on `venues`, which keeps removed rows).
4. Old bookmarks `/liste?k=…` → still work (and now set the cookie); the list's buttons (rotate, facade, show/hide, done) work with the cookie alone.
5. Venue without a sealed owner key → request card shows "kein Link" instead of a broken WhatsApp button.

---

### Task 1: Requests in the store

**Files:**
- Modify: `api/_lib/venues/schema.sql` (append table), `api/_lib/venues/store.mjs`, `api/_lib/venues/pg-store.mjs`
- Test: `api/_lib/venues/store.test.mjs` (inside `storeContract`, so both stores run it); add `venue_requests` to the truncate list in `pg-store.test.mjs`

**Interfaces — Produces:**
- `addRequest(slug, { type: 'claim'|'handoff'|'removal', name = '', phone = '', text = '' }) → id`
- `listRequests() → [{ id, slug, venueName, type, name, phone, text, at, doneAt|null }]`, open first, then newest first; `venueName` from `venues.facts->>'name'`
- `setRequestDone(id, done: boolean)`
- `countRequestsSince(slug, sinceIso) → number`
- `purgeRequests(nowIso)` deletes done ones with `done_at` older than 90 days and open ones with `at` older than 180 days

Table: `venue_requests (id bigserial pk, slug text not null references venues(slug) on delete cascade, type text not null check (type in ('claim','handoff','removal')), name text not null default '', phone text not null default '', text text not null default '', at timestamptz not null default now(), done_at timestamptz)`, index on `(done_at, at)`.

- [ ] Step 1: tests `requests: add, list open first then newest, mark done and back`, `requests: count per venue since a time`, `requests: purge after 90 days done / 180 days open` (memory store gets an injectable clock the way `nowIso` already works; pg test inserts rows with explicit `at`/`done_at` through the methods' optional `at` argument only if needed — otherwise purge with a far-future `nowIso`), `requests: a removed venue's request keeps the venue name`.
- [ ] Step 2: `npm test` → those fail.
- [ ] Step 3: implement in both stores and schema.sql.
- [ ] Step 4: `node --test api/_lib/venues/store.test.mjs api/_lib/venues/pg-store.test.mjs` → pass.
- [ ] Step 5: commit `feat(venues): owner requests in the store`.

### Task 2: Claim endpoint

**Files:** Modify `api/_lib/venues/http.mjs` (add `handleClaim`); Create `api/venue/claim.js` (POST only, like `chat.js`); Test `api/_lib/venues/http.test.mjs`.

**Interfaces:** Consumes Task 1. Produces `handleClaim(req, { store, now })`: JSON `{ slug, name, phone, text, website }` (`website` is the honeypot) → `200 {ok:true}`; 404 unknown/removed venue; 400 missing name, name > 80, text > 500, phone not matching `/^\+?[0-9 ()\/-]{6,20}$/` with ≥ 6 digits; 429 when `countRequestsSince(slug, viennaDayStart(now()))` ≥ 3; honeypot non-empty → 200 and nothing stored. Middleware already lets `/api/*` through on venue subdomains, so the page posts to the relative `/api/venue/claim`.

- [ ] Step 1: tests for each case above (`claim: stores a request`, `claim: honeypot`, `claim: bad phone / long text → 400`, `claim: 4th request in a day → 429`, `claim: removed venue → 404`).
- [ ] Step 2: run → fail. Step 3: implement. Step 4: run → pass.
- [ ] Step 5: commit `feat(venues): owners can ask for access from the page`.

### Task 3: Chat handoffs and removals become requests

**Files:** Modify `api/_lib/venues/assistant.mjs` (`runEffect`, cases `handoff` and `removal`: also `store.addRequest(slug, { type, text })`); Test `api/_lib/venues/assistant.test.mjs`.

- [ ] Step 1: tests `chat handoff creates a handoff request with the text`, `chat removal creates a removal request`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): chat hand-offs reach the private list`.

### Task 4: "Sind Sie der Inhaber?" on the page

**Files:** Modify `api/_lib/venues/template.mjs` (footer + dialog markup, CSS, small inline script), `api/_lib/venues/i18n.mjs` (DE/EN strings); Test `api/_lib/venues/template.test.mjs` or `merge.test.mjs` (where the footer is tested).

Footer, only when `v.confirmed !== true`: `Angaben nicht vom Inhaber bestätigt · <button class="claim">Sind Sie der Inhaber?</button>` (EN "Are you the owner?"). A `<dialog>` with: heading "Kostenlos verwalten", line "Öffnungszeiten, Telefon, Fotos – direkt am Handy.", inputs name, mobile (`type=tel`), optional message, hidden honeypot `website`, line linking to `https://www.namax.at/datenschutz#inhaber`, button "Zugang anfordern"; on success "Danke! Wir melden uns, meist innerhalb eines Tages." The script hides the link when `location.search` has `k=` (the owner's own view) and posts JSON to `/api/venue/claim`. No `<script>` that breaks the existing scripts-parse test.

- [ ] Step 1: tests `footer: unconfirmed page offers "Sind Sie der Inhaber?" and a form posting to /api/venue/claim`, `footer: confirmed page has no owner link`, `the claim dialog has a hidden honeypot and a privacy link`, page scripts still parse.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): quiet owner link in the page footer`.

### Task 5: Requests and remembered login in the private list

**Files:** Modify `api/_lib/venues/http.mjs` (`handleAdmin`, `handleAdminRotate`, `handleAdminFacade`, new done action), `api/_lib/venues/admin.mjs` (`renderChooser` and `renderAdmin` get `requests`, client JS stops reading `k` from the URL); Test `api/_lib/venues/admin.test.mjs`.

**Interfaces:** Consumes Task 1. Admin key resolution: `?k=` first, else cookie `namax_admin`. A GET with a valid `?k=` answers `303` to the same URL without `k`, with `Set-Cookie: namax_admin=<key>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`. POST JSON accepts `{ requestId, done: true|false }` → `setRequestDone` → `200 {done}`; existing rotate/status/facade keep working with the key from body or cookie. `handleAdmin` calls `purgeRequests(now)` and passes `requests` to both the chooser and the cards page.

Requests block (start page, above the districts): heading "Anfragen" with the open count; each card: venue name linking to its page, German type label (claim "Zugang gewünscht", handoff "Nachricht aus dem Chat", removal "Seite gelöscht"), time (Vienna), name, phone as `tel:` link, text; buttons "Link per WhatsApp" (`https://wa.me/<digits>?text=` + encoded owner link from `openOwnerKey`; "kein Link" when none or no phone), "Erledigt" / "Wieder offen". Done ones collapsed below "Erledigt (n)".

- [ ] Step 1: tests `login: ?k= sets the cookie and redirects without the key`, `cookie alone opens the list; wrong cookie → 404`, `start page shows open requests first with count, escaped`, `WhatsApp link carries the owner link; no sealed key → "kein Link"`, `POST requestId done → marked; without admin → 404`, `rotate and status still work with the cookie only`, existing admin tests updated where they relied on `?k=` in JS.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): requests and remembered login in the private list`.

### Task 6: Privacy text, migration, deploy

**Files:** Modify `datenschutz.html` and `en/datenschutz.html` (section `id="inhaber"`: owner form stores name, mobile number, message to answer the request; deleted 90 days after it is handled, at the latest after 180 days; legal basis Art. 6(1)(b)/(f) DSGVO).

- [ ] Step 1: write both sections; `npm test` → all green.
- [ ] Step 2: show Nasim the result; after his "да": apply the `venue_requests` part of schema.sql to production (one-off script with DATABASE_URL), push venue-conveyor to main.
- [ ] Step 3: verify live: claim form on a page stores a request (test on a hidden venue, then mark it done), list shows it, `/liste?k=` redirects to `/liste`, privacy section reachable at `/datenschutz#inhaber`.
- [ ] Step 4: commit `docs(privacy): owner request form`.
