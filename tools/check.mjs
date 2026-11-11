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

  if (!isLegal) rule(!/mailto:|office@na-max\.com/.test(html), 'no-email-outside-legal');

  if (isHome) {
    for (const id of ['hero', 'services', 'showcase', 'how', 'contact']) {
      rule(html.includes(`id="${id}"`), `section-${id}`);
    }
    rule((html.match(/href="https:\/\/wa\.me\/4367764292055\?text=/g) || []).length >= 3, 'whatsapp-cta');
    rule(text.length > 1200, 'text-in-html');
  }
}

if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\n${failures.length} rule violation(s) in ${pages.length} page(s).`);
  process.exit(1);
}
console.log(`OK — ${pages.length} page(s), all rules hold.`);
