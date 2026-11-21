# Owner requests in the private list — design

Agreed with Nasim on 2026-11-22.

## Intent

Venue owners must be able to reach their page's chat easily, and whatever needs Nasim must reach him, without him answering
thousands of venues himself. Nasim checks a few times a day, like the orders of his online shop: nothing needs to be instant.

## Goals

- An owner who found their page through Google can ask for access, quietly, without an "I am the owner" button
  that makes the page look unserious to normal visitors.
- Everything that needs Nasim lands in one place: the private list (www.namax.at/liste), which becomes his admin.
  Three kinds of request: access requested from the page, "wants a real website / other question" from the chat (handoff),
  "remove my page" from the chat.
- Nasim answers an access request with one tap: WhatsApp to the owner's mobile with the owner link already in the text.

## Non-goals (later steps)

E-mail or Telegram notices, SMS codes, postcards and the "enter the code from the card" path, automatic verification.

## Anti-goals

- A visible owner button on the page for every visitor.
- Personal data (names, phone numbers) kept forever, or readable by anyone holding a screenshot of the list's URL.
- The chat telling an owner "forwarded" when nobody ever sees it (today's state).

## Approaches considered

- A. Requests inside the private list (chosen by Nasim): one link he already uses, search and requests together, nothing external.
- B. A plus an e-mail per request: needs a mail service account; can be added later without rework.
- C. Telegram: Nasim does not need it.

## Design

- Page footer: the existing grey line "Angaben nicht vom Inhaber bestätigt" gets a quiet link "Sind Sie der Inhaber?"
  (EN: "Are you the owner?"). Only on unconfirmed pages, never for the owner's own keyed view.
  It opens a small dialog: "Kostenlos verwalten: Öffnungszeiten, Telefon, Fotos." with name, mobile number and an optional message,
  a line pointing to the privacy page, and "Zugang anfordern". Thanks text: "Wir melden uns, meist innerhalb eines Tages."
- Public POST /api/venue/claim stores a request. Guards: unknown or removed venue → 404; honeypot field; length limits;
  at most 3 requests per venue per day and a valid-looking phone number.
- Chat: the existing handoff and removal effects also store a request (removal: the page is gone already, the request tells Nasim).
- Storage: new table venue_requests (id, slug, type claim|handoff|removal, name, phone, text, at, done_at).
- Private list start page: "Anfragen" block above the district buttons, newest first, open ones on top with a count.
  Each: venue name (link to its page and card), type, when, name and phone, text; buttons "Link per WhatsApp"
  (wa.me to the given phone with the owner link from the sealed key), "Anrufen", "Erledigt".
- Login: /liste?k=KEY sets an HttpOnly, Secure, SameSite=Strict cookie and redirects to /liste without the key;
  every later GET and POST reads the cookie (the key in the URL still works). The key never stays in the address bar.
- Retention: requests marked done are deleted 90 days after done_at; open ones older than 180 days too. Purged when the list loads.
- Privacy page (datenschutz.html, DE and EN): one section on the owner form: what is stored, why, how long.

## Left to the builder

Exact wording of the dialog in EN, layout details of the request cards, how the count looks.
