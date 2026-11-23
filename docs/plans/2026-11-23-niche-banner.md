# Niche banner on free venue pages: plan

Status: draft, waiting for Nasim's ok. Nothing is built or deployed yet.

## Goal

A free page without the owner's photos shows a dark still-life photo of its trade. For example, scissors and thread spools for a tailor, a pizza for a pizzeria. The photo is marked "Symbolbild / Example image" and carries the owner button "+ Fotos hinzufügen". It replaces the linocut "Noch keine Fotos" frame, which shows the wrong tools for some trades. It disappears as soon as the page has a facade photo or owner photos.

Tried on 2026-11-23 on kardash, demirer and schnitzel-landmann-3 (local files only). Nasim chose this version.

## Rules (agreed)

- Show only images of the trade's tools or food, never a room or salon interior. A visitor must not take it for the place itself.
- Always label it "Symbolbild" (EN: "Example image").
- For food, use the cuisine from the data. If the cuisine is unknown or has no matching image, show a neutral food image or no banner. Never show a guessed dish.
- Give each trade 2–3 images, chosen by slug, so neighbours on one street differ.
- The owner's own photos always win.

## How it works

1. **Image choice** (`api/_lib/venues/niche.mjs`, new). `nicheImage(venue)` returns an image path or `null`.
   - By kind:
     - friseur: hair or barber;
     - nails;
     - kosmetik;
     - schneider: tailor;
     - handy: phone repair (missing, see the pack below);
     - cafe: coffee, cake or breakfast.
   - restaurant and imbiss by the OSM cuisine (`internal.cuisine`, the first value that matches):
     - pizza, italian: pizza or pasta;
     - kebab, turkish: döner, dürüm, adana or lahmacun;
     - asian, chinese, vietnamese, thai: bowl or noodles;
     - japanese, sushi: sushi;
     - indian: curry;
     - burger;
     - austrian, regional, heuriger: schnitzel;
     - balkan: ćevapi;
     - greek;
     - falafel or hummus.
   - The variant is picked by a stable hash of the slug.
   - Check first that `internal.cuisine` reaches the renderer on the live (DB) path. If it doesn't, carry only `cuisine` into the page data and never the rest of `internal`.
2. **Banner** (`template.mjs`). With no facade and no photos, the banner goes in the facade slot under the sign. The CSS is the one from the trial: 16:9, rounded corners, a dark band at the bottom, the owner button in the sign colour, and the page font. The text is short enough to fit on one line on a phone (DE + EN).
   - The button shows only when `offersClaim()` is true.
   - With no matching image, there is a small text line with the same button and no frame.
   - The old `.nophoto` frame and `NOPHOTO` are removed.
3. **Images** in `v/_shared/niche/<trade>-<n>.webp`, 1200 px wide, about 100 KB each. These are finished images from the design library, never the originals. They load with `loading="lazy"`, except above the fold on phones, where they get `fetchpriority="high"` like the facade.
4. **Tests** (`template.test.mjs`, `niche.test.mjs`):
   - a banner appears with no photos;
   - no banner when there is a facade or photos;
   - the "Symbolbild" label is there;
   - no button for a claimed page;
   - cuisine "pizza" gives a pizza image;
   - unknown cuisine gives no dish;
   - the same slug always gets the same image.
5. **Check**: render about 10 pages locally, covering every trade, light and dark signs, phone and computer. Then show them to Nasim.

## Images we have / are missing

There already are photo-dark-hair, -barber, -nails, -cosmetics, -tailor, -coffee, -cake, -breakfast, -pizza, -kebab, -sushi, plus akiwi dishes: döner, dürüm, adana, lahmacun, pide, pizza, pasta, ramen, curry, burger, schnitzel, ćevapi, falafel, hummus, sushi.

Missing pack (≤ 20, prompts are discussed before they are given):
- phone repair ×2;
- neutral restaurant table ×2;
- asian bowl and Chinese dishes ×2;
- Vietnamese pho;
- Greek;
- Heuriger wine and bread;
- café ×1 more;
- 2nd variants for hair, barber, nails, cosmetics and tailor;
- Indian ×1 more.

## Order and stops

1. Code and tests with the existing images. Trades without an image get the text line.
2. Local check, then show Nasim the screenshots.
3. Commit on a branch. **Push/deploy only after Nasim's separate ok.**
4. The missing pack later, after Nasim generates it, using the usual library route.

No database writes. No messages to owners.
