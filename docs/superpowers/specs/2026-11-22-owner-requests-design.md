# Owner requests in the private list — design

Agreed with Nasim on 2026-11-22 (trimmed the same day: "не даём ли мы очень много бесплатно"; then: the owner must write first).

## Intent

The free page is a hook for Nasim's sales talk, not a free self-service tool. The owner makes the first contact
(form on the page, after finding it on Google, a postcard or a personal visit); Nasim answers that request himself,
a few times a day (nothing needs to be instant). This also keeps it legal: in Austria § 174 TKG 2021 forbids advertising
calls, e-mail and SMS without prior consent, to businesses too, and a published number is not consent (WKO).
Answering the owner's own request is not cold contact.

## Goals

- An owner who found their page can leave a request quietly, without a visible "I am the owner" button.
- The request is the owner's consent to be contacted on the number they typed, by the way they chose (call or WhatsApp).
- Requests land in the private list (www.namax.at/liste), Nasim's admin: search plus requests.
- After the talk, Nasim can open the chat for that one venue and send the owner their link.

## Free forever vs paid

- Free forever: any text information (hours, phone, address, description, services and prices as text, languages, payment),
  up to 3 photos, changes through the chat once Nasim opened it, the address `<name>.namax.at`
  and the footer credit "Website von namax.at" (stays on free pages).
- Paid: own domain and design without the credit, unlimited gallery, menu/price list designed, video,
  online booking, Google profile and reviews care, Telegram bot, Nasim updating the page regularly.

## Non-goals (later)

Telegram, staff links, e-mail notices, SMS codes, postcards with codes, automatic ownership checks, paid features themselves.
No mass WhatsApp/SMS/e-mail/cold calls to venues; first touch is the page itself, postal mail or a personal visit.

## Anti-goals

- A visible owner button on the page for every visitor.
- Nasim contacting a venue before it asked (cold call to the business number).
- A bot talking to thousands of owners nobody has spoken to.
- Personal data kept forever, or readable by anyone holding a screenshot of the list's URL.

## Design

- Page footer: the grey line "Angaben nicht vom Inhaber bestätigt" gets a quiet link "Sind Sie der Inhaber?"
  (EN "Are you the owner?"). Only on unconfirmed pages, not in the owner's keyed view.
  Dialog "Kostenlos verwalten": name, phone ("Ihre Telefonnummer"), "Wie dürfen wir Sie erreichen?" Anruf / WhatsApp,
  optional message, honeypot, privacy link, the line "Mit dem Absenden sind Sie einverstanden, dass wir Sie dazu kontaktieren.",
  button "Anfrage senden". Thanks: "Danke! Wir melden uns, meist innerhalb eines Tages."
- Public POST /api/venue/claim stores the request with the chosen channel and the time (= consent time).
  Guards: unknown or removed venue → 404; honeypot; length limits; valid-looking phone; ≤ 3 requests per venue per Vienna day.
- Chat per venue: closed by default for every venue. Nasim opens it in the list ("Chat freischalten" / "Chat sperren")
  after talking to the owner, then sends the owner link himself. A keyed page of a venue with a closed chat shows the
  old bar with WhatsApp to Nasim; POST /api/venue/chat answers 404 for it.
- Photos: at most 3 shown photos per free page (the facade picture is separate, as today).
- Storage: table venue_requests (id, slug, name, phone, channel call|whatsapp, text, at, done_at);
  venues get chat_open boolean default false.
- Private list start page: "Anfragen" block above the district buttons, open first with a count, newest first.
  Card: venue name (link), when, name, phone, chosen channel as the main button (tel: or wa.me to the typed number),
  text, "Chat freischalten" for that venue, "Erledigt" / "Wieder offen". Done ones collapsed under "Erledigt (n)".
  The venue card in the district view also gets the chat switch.
- Login: /liste?k=KEY sets an HttpOnly, Secure, SameSite=Strict cookie and redirects to /liste without the key;
  later GETs and POSTs read the cookie (the key in the URL still works).
- Retention: done requests deleted 90 days after done_at; open ones after 180 days. Purged when the list loads.
- Privacy page (datenschutz.html, DE and EN): section #inhaber: what is stored, why (answer the request), how long.

## Left to the builder

Exact EN wording, layout of the request cards.
