# Honest visit counter: plan

Status: draft, waiting for Nasim's ok. Nothing is built.

## Why

On 2026-11-23 the admin showed 65 visitors in one day. Search Console (domain property `sc-domain:namax.at`) shows 7 Google clicks in 3 months, and only 16 pages are indexed, so the venue pages are almost absent from Google. The visits came from:
- **Claude's own screenshots that day.** The mockup and banner tools used headless Edge with an iPhone user agent, and the trial pages had `<base>` pointing at the live site, so their beacon reached it. Roughly 20–30 of the 65.
- **Robots that run a real browser with a normal Chrome user agent.** They find pages through the public sitemap and the "Rundherum" links.

Today a visit is counted when `navigator.sendBeacon('/api/venue/hit')` runs on page load (`api/_lib/venues/page.mjs`) and the user agent doesn't match `BOT_UA` (`http.mjs`). That is too easy to trigger.

The goal: the number in the admin and in the owner's cabin means "a person looked at the page". It can then be shown to an owner without embarrassment.

## Rules

- No cookies or storage for visitors, no IP and no personal data stored. Only counts per page and day, so no consent banner is needed.
- The only cookie belongs to Nasim, on his own device, set by the admin page.
- No old rows are deleted. Counting simply starts again from the fix date.

## What changes

1. **Human check in the page script** (`page.mjs`, the `HIT` script). The beacon is sent once per page load, only if:
   - `navigator.webdriver` is not true (browsers driven by a program say so), and
   - the page is visible (`document.visibilityState`), and
   - the visitor interacted (`scroll`, `pointerdown`, `keydown`, `touchstart`) after at least 3 s of visibility, or the page stayed visible for 15 s (someone just reading).
   - The script stays tiny and inline and doesn't block the page.
2. **Where they came from.** The script sends `{ src }`, made in the browser from `document.referrer` (only the host, never the full address):
   - `google`;
   - `bing` (also DuckDuckGo, Ecosia);
   - `social` (Facebook, Instagram, WhatsApp, t.co, TikTok);
   - `namax` (www.namax.at incl. /kostenlos, or another venue page);
   - `other`;
   - `direct` (no referrer).

   The server accepts only these words; anything else becomes `other`.
3. **Not counting Nasim.** When the admin page opens with a valid admin key, it also sets the cookie `nx_staff=1; Domain=namax.at; Path=/; Max-Age=31536000; Secure; SameSite=Lax`. `handleHit` skips any request that carries it. The value is no secret: a visitor who fakes it only removes their own visit.
4. **Not counting Claude's tools.** `design-library/tools/site-mockups.py` and any preview scripts block `*/api/venue/hit*` via CDP `Network.setBlockedURLs`. Local trial pages never set `<base>` to the live site again (written into the tools' header comment).
5. **Storage** (`schema.sql`, `store.mjs`, `pg-store.mjs`):
   - The new table `venue_hit_sources (slug, day, source, n, primary key (slug, day, source))` is added with `create table if not exists`.
   - `addHit(slug, { owner, day, source })` also bumps it.
   - Existing `venue_hits` rows stay.
6. **Fresh start.**
   - The constant `COUNT_FROM` = the deploy date (`owner.mjs` / `http.mjs`).
   - `getHits` and `hitSummary` only sum days ≥ `COUNT_FROM`, so the inflated numbers vanish from the admin and the owner cabin without deleting anything.
7. **Admin.** The Lokale list keeps "today / week". The header line adds the week's sources, for example "Google 3 · direkt 5 · namax 2", so it shows at a glance whether search works.
8. **Owner cabin.** Unchanged: it shows the visitor number, now an honest one.

## Tests (node --test, written first)

- `handleHit`:
  - with the `nx_staff` cookie → nothing counted;
  - an unknown `src` → `other`;
  - a bot user agent → nothing (as today);
  - `src: 'google'` → `venue_hit_sources` row +1.
- Store contract (both stores, incl. PGlite): `addHit` with source; `getHits` and `hitSummary` ignore days before `COUNT_FROM`.
- Page: the public page contains the human-check script, checks `navigator.webdriver` and no longer has the bare `sendBeacon(...,'{}')` on load. The owner page keeps counting the owner with the key.
- Admin: a valid key response sets `nx_staff`, an invalid one does not.

## Order and stops

1. Code and tests on a branch, all tests green.
2. Local check in the browser:
   - a normal visit counts after scrolling;
   - a quick load without action does not;
   - headless Edge does not;
   - with `nx_staff` nothing is counted.
3. **Deploy only after Nasim's separate ok.** The new table needs `tools/venue-schema.mjs` on the production database. That is a DB write, so it needs Nasim's ok.
4. After 3–4 days, compare the counter with Search Console clicks.

Not part of this plan, a separate task: getting the venue pages indexed by Google (sitemap for the subdomains, Search Console).
