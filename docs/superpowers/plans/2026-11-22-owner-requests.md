# Owner Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners write first through a quiet form on their page; requests land in Nasim's private list (remembered login); he answers on the typed number and opens the chat per venue after the talk. Free pages show at most 3 photos.

**Architecture:** A new `venue_requests` table and a `chat_open` flag behind the existing store interface (memory + Postgres, one shared contract test). A public `POST /api/venue/claim` writes requests; the private list shows them and switches the chat per venue. Keyed pages of venues with a closed chat fall back to `ownerBar()`.

**Tech Stack:** Node ESM on Vercel functions, Neon Postgres (PGlite in tests), node:test.

**Spec:** `docs/superpowers/specs/2026-11-22-owner-requests-design.md`

## Global Constraints

- Owner keys never appear in public HTML; the admin key is never printed or committed (only `.env.local` and Vercel env).
- Everything Nasim sees in the list is German; owner-facing page text is DE + EN through `tr()` / `ui()`.
- Every value from a request (name, phone, text) is escaped with `esc()` wherever it is rendered.
- Contact buttons in the list go to the number the owner typed, never to a number the owner did not give.
- No production DB write (schema migration) and no push to main without Nasim's explicit "да".
- Tests: `npm test` must stay green.

## Review Focus

1. A bot posting the claim form in a loop → at most 3 requests per venue per Vienna day; honeypot filled → 200, nothing stored.
2. `<script>` in name or text → rendered escaped in the list; phone with letters or under 6 digits → 400; channel other than call|whatsapp → 400.
3. A request for a venue later removed → still listed with the venue's name (join on `venues`, which keeps removed rows).
4. Old bookmarks `/liste?k=…` → still work (and set the cookie); all list buttons (rotate, facade, show/hide, done, chat switch) work with the cookie alone.
5. An owner with an old `?k=` link whose chat is closed → WhatsApp bar, no chat; `/api/venue/chat` → 404; after "Chat freischalten" the same link shows the chat.

---

### Task 1: Store — requests and chat flag

**Files:** Modify `api/_lib/venues/schema.sql`, `store.mjs`, `pg-store.mjs`; Test `store.test.mjs` (inside `storeContract`), add `venue_requests` to the truncate list in `pg-store.test.mjs`.

**Produces:**
- `addRequest(slug, { role: 'owner'|'staff'|'other', wish: 'fix'|'photos'|'website'|'remove', name = '', phone, channel: 'call'|'whatsapp', text = '' }) → id`
- `listRequests() → [{ id, slug, venueName, role, wish, name, phone, channel, text, at, doneAt|null }]`: open first; among open ones `wish === 'website'` first; then newest; `venueName` from `venues.facts->>'name'`
- `setRequestDone(id, done: boolean)`, `countRequestsSince(slug, sinceIso) → number`
- `purgeRequests(nowIso)`: deletes done with `done_at` < now − 90 days and open with `at` < now − 180 days
- `setChatOpen(slug, open: boolean)`; `getVenue(slug)` returns `chatOpen` (default `false`)

SQL: `create table if not exists venue_requests (id bigserial primary key, slug text not null references venues(slug) on delete cascade, role text not null check (role in ('owner','staff','other')), wish text not null check (wish in ('fix','photos','website','remove')), name text not null default '', phone text not null, channel text not null check (channel in ('call','whatsapp')), text text not null default '', at timestamptz not null default now(), done_at timestamptz)`, index on `(done_at, at)`; `alter table venues add column if not exists chat_open boolean not null default false`.

- [ ] Step 1: tests `requests: add, list open first (website wishes first) then newest, mark done and back`, `requests: count per venue since a time`, `requests: purge (far-future nowIso removes all; now keeps all)`, `requests: a removed venue's request keeps the venue name`, `chat: closed by default, open and close again`.
- [ ] Step 2: run → fail. Step 3: implement both stores + schema. Step 4: `node --test api/_lib/venues/store.test.mjs api/_lib/venues/pg-store.test.mjs` → pass.
- [ ] Step 5: commit `feat(venues): owner requests and per-venue chat flag in the store`.

### Task 2: Claim endpoint

**Files:** Modify `api/_lib/venues/http.mjs` (`handleClaim`); Create `api/venue/claim.js` (POST only, like `chat.js`); Test `http.test.mjs`.

**Produces:** `handleClaim(req, { store, now })`: JSON `{ slug, role, wish, name, phone, channel, text, website }` (`website` = honeypot) → `200 {ok:true}`; 404 unknown/removed venue; 400 name > 80, text > 500, role/wish/channel outside their lists, phone not matching `/^\+?[0-9 ()\/-]{6,20}$/` or < 6 digits; 429 when `countRequestsSince(slug, viennaDayStart(now()))` ≥ 3; honeypot non-empty → 200, nothing stored.

- [ ] Step 1: tests `claim: stores a request with channel`, `claim: honeypot`, `claim: bad phone / bad channel / long text → 400`, `claim: 4th request in a day → 429`, `claim: removed venue → 404`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): owners can leave a request from the page`.

### Task 3: Chat only where Nasim opened it; 3 photos

**Files:** Modify `api/_lib/venues/page.mjs` (keyed view: `record.chatOpen` → `ownerPart`, else `ownerBar()`), `http.mjs` chat handler (404 when `!record.chatOpen`), `assistant.mjs` and `merge.mjs` (`MAX_SHOWN_PHOTOS = 3`); Test `page.test.mjs`, `http.test.mjs`, `assistant.test.mjs`, `merge.test.mjs` (existing 4-photo tests updated to 3).

- [ ] Step 1: tests `keyed page with closed chat shows the WhatsApp bar`, `keyed page with open chat shows the chat`, `chat endpoint → 404 while closed`, `a 4th photo cannot be shown`, `page shows at most 3 photos`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): chat per venue, three free photos`.

### Task 4: "Sind Sie der Inhaber?" on the page

**Files:** Modify `template.mjs` (footer + `<dialog>`, CSS, small inline script), `i18n.mjs`; Test `merge.test.mjs` (footer tests live there).

Footer, only when `v.confirmed !== true` and not the owner view: `Website von namax.at · Angaben nicht vom Inhaber bestätigt · <button class="claim">Sind Sie der Inhaber?</button>` (EN "Are you the owner?"). Dialog "Kostenlos verwalten" in three steps with big tap buttons and "Schritt n von 3", back link on steps 2–3:
1 "Wer sind Sie?" Inhaber/in (`owner`) · Familie / Mitarbeiter (`staff`) · Etwas anderes (`other`) — EN "Who are you?" Owner · Family / staff · Something else;
2 "Was möchten Sie?" Angaben korrigieren (`fix`) · Fotos hinzufügen (`photos`) · Eigene Website (`website`) · Seite entfernen (`remove`) — EN "What would you like?" Correct details · Add photos · Own website · Remove page;
3 "Fast geschafft! Wie dürfen wir Sie erreichen?" Anruf / WhatsApp (EN "Almost done! How may we reach you?" Call / WhatsApp); inputs name, "Ihre Telefonnummer" (`type=tel`, required); optional message; hidden honeypot `website`; line "Mit dem Absenden sind Sie einverstanden, dass wir Sie dazu kontaktieren." (EN "By sending you agree that we contact you about it."); link `https://www.namax.at/datenschutz#inhaber`; button "Anfrage senden"; success "Danke! Wir melden uns, meist innerhalb eines Tages." Script posts JSON to relative `/api/venue/claim`.

- [ ] Step 1: tests `footer: unconfirmed page offers "Sind Sie der Inhaber?" and a form posting to /api/venue/claim`, `footer: confirmed page has no owner link`, `claim dialog has the three steps with all role/wish values, channel choice, consent line, hidden honeypot and privacy link`, page scripts still parse.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): quiet owner link in the page footer`.

### Task 5: Requests, chat switch and remembered login in the private list

**Files:** Modify `http.mjs` (`handleAdmin`, `handleAdminRotate`, `handleAdminFacade`, new actions), `admin.mjs` (`renderChooser` gets `requests`; venue cards get the chat switch; client JS stops reading `k` from the URL); Test `admin.test.mjs`.

Admin key: `?k=` first, else cookie `namax_admin`. GET with valid `?k=` → `303` to the same URL without `k`, `Set-Cookie: namax_admin=<key>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`. POST `{ requestId, done }` → `setRequestDone` → `200 {done}`; POST `{ slug, chatOpen }` → `setChatOpen` → `200 {chatOpen}`. `handleAdmin` calls `purgeRequests(now)`.

Request card: venue name linking to its page, time (Vienna), answers as one German line (`Inhaber/in · Eigene Website · WhatsApp`), badge "Website!" when `wish === 'website'`, name, text; main button by channel — call → "Anrufen" `tel:<typed>`, whatsapp → "WhatsApp" `https://wa.me/<digits of typed>`; "Chat freischalten" / "Chat sperren" for that venue; "Erledigt" / "Wieder offen"; done ones under "Erledigt (n)". Venue cards in the district view: same chat switch, badge "Chat offen".

- [ ] Step 1: tests `login: ?k= sets the cookie and redirects without the key`, `cookie alone opens the list; wrong cookie → 404`, `start page shows open requests first with count, escaped`, `call request → tel: typed number; whatsapp request → wa.me typed number`, `POST requestId done → marked; POST chatOpen → switched; without admin → 404`, `rotate and status still work with the cookie only`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(venues): requests, chat switch and remembered login in the private list`.

### Task 6: Privacy text, migration, deploy

**Files:** `datenschutz.html`, `en/datenschutz.html` (section `id="inhaber"`: name, phone, chosen channel, message stored to answer the request; deleted 90 days after handled, at the latest after 180 days; Art. 6(1)(a)/(b) DSGVO, consent given by sending).

- [ ] Step 1: write both sections; `npm test` → green; commit `docs(privacy): owner request form`.
- [ ] Step 2: show Nasim; after his "да": apply the Task 1 SQL to production (one-off script with DATABASE_URL), push venue-conveyor to main.
- [ ] Step 3: verify live: request on a hidden venue lands in the list, mark done; `/liste?k=` redirects to `/liste`; old owner link shows the WhatsApp bar, chat opens after the switch; at most 3 photos; `/datenschutz#inhaber` reachable.
