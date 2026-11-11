// Site rule checks. Reads raw HTML only — what a crawler or a no-JS visitor gets.
// Run: node tools/check.mjs   (exit 0 = all rules hold)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [];
for (const dir of ['', 'en']) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    if (f.endsWith('.html')) pages.push(dir ? `${dir}/${f}` : f);
  }
}

const failures = [];
for (const page of pages) {
  const html = readFileSync(join(root, page), 'utf8');
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const isLegal = /impressum|datenschutz/.test(page);
  const isHome = /(^|\/)index\.html$/.test(page);
  const rule = (ok, name) => { if (!ok) failures.push(`${page}: ${name}`); };

  rule(!/€|\bEUR\b|\b799\b/.test(html), 'no-price');
  rule(!/2006|20 Jahre|20 years|Vater|Sohn|father|\bson\b/i.test(text), 'no-invented-claims');
  rule(!/t\.me\/(<|"|'|\s|$)/.test(html), 'no-telegram-placeholder');
  rule(!/https?:\/\/(fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|cdnjs)/.test(html), 'no-external-requests');
  rule(/<link rel="canonical" href="https:\/\/www\.namax\.at\//.test(html), 'canonical');
  rule(/hreflang="de"/.test(html) && /hreflang="en"/.test(html) && /hreflang="x-default"/.test(html), 'hreflang');

  rule(/<meta property="og:image" content="https:\/\/www\.namax\.at\/og-(de|en)\.png"/.test(html), 'og-image');
  rule(/<script type="application\/ld\+json">/.test(html) === isHome, 'json-ld-on-home-only');
  rule(/<meta name="description" content="[^"]{50,160}"/.test(html), 'description');
  rule(!/aggregateRating|priceRange|foundingDate/.test(html), 'no-invented-structured-data');

  if (!isLegal) rule(!/mailto:|@na-max\.com|@gmail\.com/.test(html), 'no-email-outside-legal');

  // service pages: a real page of text with its own heading and a way to get in touch
  if (!isLegal && !isHome) {
    rule(/<h1[ >]/.test(html), 'service-h1');
    rule(text.length > 1600, 'service-text'); // English runs shorter than German
    rule((html.match(/href="https:\/\/wa\.me\/4367764292055\?text=/g) || []).length >= 2, 'service-whatsapp-cta');
  }

  if (isHome) {
    for (const id of ['hero', 'services', 'showcase', 'how', 'contact']) {
      rule(html.includes(`id="${id}"`), `section-${id}`);
    }
    rule((html.match(/href="https:\/\/wa\.me\/4367764292055\?text=/g) || []).length >= 3, 'whatsapp-cta');
    rule(text.length > 1200, 'text-in-html');
  }
}

// every service has its own page per language, the home page links to it and the sitemap lists it
const SERVICE_PAGES = {
  '': ['webdesign-wien', 'social-media-wien', 'content-reels-wien', 'seo-wien', 'online-werbung-wien'],
  'en/': ['web-design-vienna', 'social-media-vienna', 'content-reels-vienna', 'seo-vienna', 'online-ads-vienna'],
};
const sitemap = existsSync(join(root, 'sitemap.xml')) ? readFileSync(join(root, 'sitemap.xml'), 'utf8') : '';
for (const [dir, slugs] of Object.entries(SERVICE_PAGES)) {
  const homeFile = join(root, dir, 'index.html');
  const home = existsSync(homeFile) ? readFileSync(homeFile, 'utf8') : '';
  for (const slug of slugs) {
    if (!pages.includes(`${dir}${slug}.html`)) failures.push(`${dir}${slug}.html: missing-page`);
    if (!home.includes(`href="/${dir}${slug}"`)) failures.push(`${dir}index.html: home-links-${slug}`);
    if (!sitemap.includes(`<loc>https://www.namax.at/${dir}${slug}</loc>`)) failures.push(`sitemap.xml: lists-${dir}${slug}`);
  }
}

if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\n${failures.length} rule violation(s) in ${pages.length} page(s).`);
  process.exit(1);
}
console.log(`OK — ${pages.length} page(s), all rules hold.`);
