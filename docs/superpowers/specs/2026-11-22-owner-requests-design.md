# Owner requests in the private list — design

Agreed with Nasim on 2026-11-22 (trimmed the same day: "не даём ли мы очень много бесплатно").

## Intent

The free page is a hook for Nasim's sales talk ("your page is already with us, Google shows it"), not a free self-service tool.
An owner who finds their page must be able to reach Nasim quietly; every such contact is a warm sales lead that Nasim
answers himself, by phone, a few times a day (like the orders of his online shop: nothing needs to be instant).

## Goals

- An owner who found their page can leave a request quietly, without a visible "I am the owner" button
  that makes the page look unserious to normal visitors.
- Requests land in the private list (www.namax.at/liste), which becomes Nasim's admin: search plus requests.
- Nasim calls the business's own public number back. That call is the ownership check and the sales talk;
  small fixes (hours, phone) he makes himself during the call.

## Free vs paid

- Free: the page from public data, the quiet "Sind Sie der Inhaber?" form, fixes Nasim makes after talking to the owner.
- Paid (later): own website and domain, photos, menu, booking, changes any time, the owner chat / Telegram.

## Non-goals (later steps)

The owner chat on pages (switched off now, code kept; comes back as a paid feature together with Telegram),
WhatsApp links with owner keys, staff links, e-mail notices, SMS codes, postcards with codes, automatic verification.
Mass WhatsApp/SMS/e-mail to venues is not allowed (TKG §174); outreach stays personal visits, calls, postal mail.

## Anti-goals

- A visible owner button on the page for every visitor.
- Owners fixing everything themselves for free, so they never need to talk to Nasim.
- A bot speaking for Nasim to thousands of owners.
- Personal data (names, phone numbers) kept forever, or readable by anyone holding a screenshot of the list's URL.

## Approaches considered

- A. Requests inside the private list, Nasim calls back (chosen).
- B. A plus self-service chat for owners: gives the product away, costs per message, removes the reason to talk. Rejected for now.
- C. Telegram notices: not needed; Nasim checks the list a few times a day.

## Design

- Page footer: the grey line "Angaben nicht vom Inhaber bestätigt" gets a quiet link "Sind Sie der Inhaber?"
  (EN "Are you the owner?"). Only on unconfirmed pages, not in the owner's keyed view.
  It opens a small dialog: "Kostenlos verwalten" with name, "Ihre Telefonnummer", optional message,
  the line "Wir rufen Sie kurz an – über die Telefonnummer des Geschäfts.", a privacy link and "Anfrage senden".
  Thanks text: "Danke! Wir melden uns, meist innerhalb eines Tages."
- Public POST /api/venue/claim stores the request. Guards: unknown or removed venue → 404; honeypot field;
  length limits; valid-looking phone; at most 3 requests per venue per Vienna day.
- Owner chat off: pages opened with the owner key show the old bar with WhatsApp to Nasim instead of the chat;
  POST /api/venue/chat answers 404 while it is off. One switch turns it back on later.
- Storage: table venue_requests (id, slug, name, phone, text, at, done_at).
- Private list start page: "Anfragen" block above the district buttons, open ones first with a count, newest first.
  Each card: venue name (link to its page), when, name, typed phone, text; the business's own number(s) as
  "Geschäft anrufen" (tel:), marked "gleiche Nummer" when it equals the typed one; "Kein Telefon – persönlich vorbeigehen"
  when the business has no number; "Erledigt" / "Wieder offen". Done ones collapsed below "Erledigt (n)".
- Login: /liste?k=KEY sets an HttpOnly, Secure, SameSite=Strict cookie and redirects to /liste without the key;
  later GETs and POSTs read the cookie (the key in the URL still works).
- Retention: done requests deleted 90 days after done_at; open ones after 180 days. Purged when the list loads.
- Privacy page (datenschutz.html, DE and EN): section #inhaber on the owner form: what is stored, why, how long.

## Left to the builder

Exact EN wording, layout of the request cards.
