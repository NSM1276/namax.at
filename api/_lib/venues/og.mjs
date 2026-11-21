// Link preview picture (og:image) for <slug>.namax.at: 1200×630 PNG as the same enamel plate as the
// venue's own page, drawn on request and cached by the CDN. WhatsApp, Instagram, Telegram and Facebook show it.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PALETTES, DEFAULT_THEME } from './themes.mjs';
import { kindLabel } from './i18n.mjs';
import { districtLine } from './template.mjs';
export { ogVersion, ogImageUrl } from './og-url.mjs';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const font = (file) => readFileSync(new URL(`./og-fonts/${file}.woff`, import.meta.url));
let fonts; // loaded on first use, so pages that never draw a picture do not read them
const loadFonts = () => fonts ||= [['Display', 'barlow-condensed'], ['Text', 'figtree']]
  .flatMap(([name, file]) => ['latin', 'latin-ext'].map((sub) => ({ name: sub === 'latin' ? name : name + 'Ext', weight: 700, style: 'normal', data: font(`${file}-${sub}-700-normal`) })));

// Each face comes in two files; the second holds ŞğıčćžđŁ… and is listed as the fallback.
const fam = (name) => `${name}, ${name}Ext`;

function palette(v) {
  const name = (v.theme && v.theme.palette) || DEFAULT_THEME.palette;
  return Object.hasOwn(PALETTES, name) ? PALETTES[name] : PALETTES[DEFAULT_THEME.palette];
}

// Inside the rim: 1200 − 2×48 page margin − 2×18 plate padding − 2×6 rim − 2×44 rim padding.
const NAME_BOX = { w: 968, h: 290 };

/** Largest font size (px) at which the name fits the rim in at most 3 lines (Barlow Condensed capitals ≈ 0.5em wide). */
function nameSize(text, charWidth = 0.5) {
  const words = text.split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));
  for (let size = 150; size > 40; size -= 4) {
    const perLine = Math.floor(NAME_BOX.w / (size * charWidth));
    if (longest > perLine) continue;
    let lines = 1, used = 0;
    for (const w of words) { if (used && used + 1 + w.length > perLine) { lines++; used = w.length; } else used += (used ? 1 : 0) + w.length; }
    if (lines <= 3 && lines * size * 1.0 <= NAME_BOX.h) return size;
  }
  return 40;
}

const el = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/** The picture as a tree for the renderer (plain objects, no React): the enamel plate on the page background. */
export function ogTree(v) {
  const pal = palette(v);
  const name = v.name.toUpperCase();
  const kind = kindLabel(v.kind, 'de').toUpperCase();
  const district = districtLine(v);
  const small = { fontFamily: fam('Text'), fontWeight: 700, color: pal.signInk, fontSize: 30 };
  const screw = (side) => el({ position: 'absolute', top: 222, [side]: 6, width: 12, height: 12, borderRadius: 6, background: pal.signInk, opacity: 0.7 }, []);
  return el({ width: OG_WIDTH, height: OG_HEIGHT, background: pal.pageBg, padding: '40px 48px 58px', position: 'relative' }, [
    el({ flex: 1, position: 'relative', background: pal.signBg, borderRadius: 28, padding: 18, boxShadow: '0 18px 36px rgba(0,0,0,.28)' }, [
      el({ flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', border: `6px solid ${pal.signInk}`, borderRadius: 18, padding: '30px 44px 28px' }, [
        el({ ...small, letterSpacing: 7 }, kind || ' '),
        el({ fontFamily: fam('Display'), fontWeight: 700, fontSize: nameSize(name), lineHeight: 1.0, color: pal.signInk, textAlign: 'center', justifyContent: 'center' }, name),
        el({ ...small, letterSpacing: 4, opacity: 0.9 }, district || ' '),
      ]),
      screw('left'), screw('right'),
    ]),
    el({ position: 'absolute', right: 52, bottom: 12, fontFamily: fam('Text'), fontWeight: 700, fontSize: 24, color: pal.ink, opacity: 0.7 }, 'namax.at'),
  ]);
}

/** venue → PNG Response. The address carries the version, so the picture can be cached for a year. */
export async function renderOg(v) {
  const svg = await satori(ogTree(v), { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  const bytes = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=31536000' } });
}
